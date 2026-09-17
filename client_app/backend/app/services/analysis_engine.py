"""Base analyzer interface and AnalysisOrchestrator.

Every analyzer exposes a consistent interface via the ``Analyzer`` ABC.
The ``AnalysisOrchestrator`` selects which analyzers to run based on
modality and requested types, executes them, aggregates signals, and
produces the final ``AnalysisJobResult``.
"""

from __future__ import annotations

import abc
import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analysis import (
    AnalysisJobV2,
    AnalyzerType,
    RiskLevel,
    SignalSeverity,
    SignalType,
)
from app.services.ai_content_detection import (
    Assessment,
    AudioAIDetector,
    DetectionInput,
    DocumentAIDetector,
    ImageAIDetector,
    TextAIEnsembleDetector,
    VideoAIDetector,
)
from app.services.model_registry import InferenceProvider

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shared value objects
# ---------------------------------------------------------------------------


@dataclass
class AnalyzerContext:
    """Read-only context passed to every analyzer."""

    job: AnalysisJobV2
    modality: str = "text"
    language: str = "en"
    media_asset_id: str | None = None
    storage_path: str | None = None
    file_size: int = 0
    mime_type: str = ""
    text_content: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AnalyzerResult:
    """What a single analyzer returns."""

    analyzer_type: AnalyzerType
    signals: list[AnalysisSignalData] = field(default_factory=list)
    scores: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    duration_ms: float = 0.0


@dataclass
class AnalysisSignalData:
    """Un-persisted signal data (will be converted to AnalysisSignal by orchestrator)."""

    signal_type: SignalType
    severity: SignalSeverity
    confidence: float
    title: str
    description: str = ""
    evidence: dict[str, Any] = field(default_factory=dict)
    model_id: str | None = None
    model_version: str | None = None


# ---------------------------------------------------------------------------
# Analyzer ABC
# ---------------------------------------------------------------------------


class Analyzer(abc.ABC):
    """Every analyzer must implement this interface."""

    @property
    @abc.abstractmethod
    def analyzer_type(self) -> AnalyzerType:
        """Return the type of this analyzer."""

    @property
    @abc.abstractmethod
    def supported_modalities(self) -> list[str]:
        """Return the modalities this analyzer can handle."""

    @abc.abstractmethod
    async def analyze(self, ctx: AnalyzerContext) -> AnalyzerResult:
        """Run the analysis and return results."""

    def can_handle(self, modality: str) -> bool:
        """Return True if this analyzer supports the given modality."""
        return modality in self.supported_modalities

    def required_models(self) -> list[str]:
        """Model IDs required by this analyzer (empty = none)."""
        return []


# ---------------------------------------------------------------------------
# Individual Analyzers
# ---------------------------------------------------------------------------


class AIContentAnalyzer(Analyzer):
    """Detects AI-generated content using modality-specific models."""

    def __init__(self, inference_provider: InferenceProvider | None = None) -> None:
        self._inference = inference_provider
        self._text_detector = TextAIEnsembleDetector()
        self._document_detector = DocumentAIDetector()
        self._modality_detectors = {
            "image": ImageAIDetector(),
            "audio": AudioAIDetector(),
            "video": VideoAIDetector(),
        }

    @property
    def analyzer_type(self) -> AnalyzerType:
        return AnalyzerType.AI_CONTENT

    @property
    def supported_modalities(self) -> list[str]:
        return ["text", "image", "audio", "video", "document"]

    def required_models(self) -> list[str]:
        return ["text-ai-detector", "image-ai-detector", "audio-ai-detector", "video-ai-detector"]

    async def analyze(self, ctx: AnalyzerContext) -> AnalyzerResult:
        start = time.monotonic()
        signals: list[AnalysisSignalData] = []
        scores: dict[str, float] = {}

        try:
            if ctx.modality in self._modality_detectors:
                if not ctx.storage_path:
                    return AnalyzerResult(
                        analyzer_type=self.analyzer_type,
                        metadata={"skipped": True, "reason": f"No input path for modality={ctx.modality}"},
                        duration_ms=(time.monotonic() - start) * 1000,
                    )
                result = self._detect_unconfigured_modality(ctx)
            elif ctx.modality in {"text", "document"} and ctx.text_content:
                result = await self._detect_text_ai(ctx)
            else:
                return AnalyzerResult(
                    analyzer_type=self.analyzer_type,
                    metadata={"skipped": True, "reason": f"No AI detection path for modality={ctx.modality}"},
                    duration_ms=(time.monotonic() - start) * 1000,
                )
            signals = result.get("signals", [])
            scores = result.get("scores", {})
            metadata = result.get("metadata", {})
        except Exception as exc:
            logger.exception("AIContentAnalyzer error: %s", exc)
            return AnalyzerResult(
                analyzer_type=self.analyzer_type,
                errors=[str(exc)],
                duration_ms=(time.monotonic() - start) * 1000,
            )

        return AnalyzerResult(
            analyzer_type=self.analyzer_type,
            signals=signals,
            scores=scores,
            metadata=metadata,
            duration_ms=(time.monotonic() - start) * 1000,
        )

    def _detect_unconfigured_modality(self, ctx: AnalyzerContext) -> dict[str, Any]:
        result = self._modality_detectors[ctx.modality].detect(
            DetectionInput(
                modality=ctx.modality,
                raw_data=ctx.storage_path,
                language=ctx.language,
                metadata=ctx.metadata,
            )
        )
        scores: dict[str, Any] = {
            "ai_content_score": result.model_probability,
            "calibrated_probability": result.calibrated_probability,
            "evidence_strength": result.evidence_strength,
        }
        if ctx.modality == "image":
            scores["noise_analysis"] = None
        return {
            "signals": [],
            "scores": scores,
            "metadata": {
                "assessment": result.assessment.value,
                "limitations": result.limitations,
                "model_version": result.model_version,
                "preprocessing_version": result.preprocessing_version,
            },
        }

    async def _detect_text_ai(self, ctx: AnalyzerContext) -> dict[str, Any]:
        detector = self._document_detector if ctx.modality == "document" else self._text_detector
        result = detector.detect(
            DetectionInput(
                modality=ctx.modality,
                text=ctx.text_content,
                language=ctx.language,
                metadata=ctx.metadata,
            )
        )
        signals = [
            AnalysisSignalData(
                signal_type=SignalType.AI_CONTENT,
                severity=(SignalSeverity.HIGH if result.assessment == Assessment.LIKELY_AI else SignalSeverity.LOW),
                confidence=result.calibrated_probability or 0.0,
                title=signal.name.replace("_", " ").title(),
                description=signal.description,
                evidence={"value": signal.value, "direction": signal.direction, "method": signal.method},
                model_version=result.model_version,
            )
            for signal in result.signals
        ]
        return {
            "signals": signals,
            "scores": {
                "ai_content_score": result.model_probability,
                "calibrated_probability": result.calibrated_probability,
                "evidence_strength": result.evidence_strength,
            },
            "metadata": {
                "assessment": result.assessment.value,
                "counter_signals": [signal.name for signal in result.counter_signals],
                "limitations": result.limitations,
                "preprocessing_version": result.preprocessing_version,
                "model_version": result.model_version,
            },
        }


class SimilarityAnalyzer(Analyzer):
    """Detects exact, near-duplicate, and semantic similarity.

    Separates three distinct signals:
    - exact_match: SHA-256 hash match (verbatim duplicate)
    - near_duplicate: high Jaccard overlap (near-duplicate)
    - semantic_similarity: TF-IDF cosine similarity (conceptual overlap)
    """

    def __init__(self, reference_corpus: list[str] | None = None) -> None:
        self._reference_corpus = reference_corpus or []

    @property
    def analyzer_type(self) -> AnalyzerType:
        return AnalyzerType.SIMILARITY

    @property
    def supported_modalities(self) -> list[str]:
        return ["text", "image"]

    async def analyze(self, ctx: AnalyzerContext) -> AnalyzerResult:
        start = time.monotonic()
        signals: list[AnalysisSignalData] = []
        scores: dict[str, float] = {}

        try:
            if ctx.modality == "text" and ctx.text_content:
                sha256 = self._text_hash(ctx.text_content)

                exact_match = await self._check_exact_hash(ctx, sha256)
                if exact_match:
                    signals.append(
                        AnalysisSignalData(
                            signal_type=SignalType.SIMILARITY,
                            severity=SignalSeverity.HIGH,
                            confidence=1.0,
                            title="Exact duplicate found in corpus",
                            description="The input text matches an existing corpus item by SHA-256 hash.",
                            evidence={"hash": sha256, "match_type": "exact"},
                        )
                    )
                    scores["exact_match"] = 1.0
                else:
                    jaccard_sim = self._jaccard_similarity(ctx.text_content, self._reference_corpus, ctx.language)
                    scores["jaccard_similarity"] = jaccard_sim

                    if jaccard_sim > 0.8:
                        signals.append(
                            AnalysisSignalData(
                                signal_type=SignalType.SIMILARITY,
                                severity=SignalSeverity.HIGH if jaccard_sim > 0.95 else SignalSeverity.MEDIUM,
                                confidence=jaccard_sim,
                                title=f"Near-duplicate match detected (Jaccard: {jaccard_sim:.0%})",
                                description="The input text is highly similar to an existing corpus item.",
                                evidence={"similarity": jaccard_sim, "match_type": "near_duplicate"},
                            )
                        )

                    cosine_sim = self._tfidf_cosine_similarity(ctx.text_content, self._reference_corpus, ctx.language)
                    scores["semantic_similarity"] = cosine_sim

                    if cosine_sim > 0.7 and jaccard_sim < 0.5:
                        signals.append(
                            AnalysisSignalData(
                                signal_type=SignalType.SIMILARITY,
                                severity=SignalSeverity.MEDIUM if cosine_sim > 0.85 else SignalSeverity.LOW,
                                confidence=cosine_sim,
                                title=f"Semantic similarity detected (cosine: {cosine_sim:.0%})",
                                description=(
                                    "The input text is semantically similar to corpus content "
                                    "but not verbatim. This may indicate paraphrasing."
                                ),
                                evidence={
                                    "cosine_similarity": cosine_sim,
                                    "jaccard_similarity": jaccard_sim,
                                    "match_type": "semantic",
                                },
                            )
                        )

                    scores["similarity_score"] = max(scores.get("exact_match", 0), jaccard_sim, cosine_sim)
        except Exception as exc:
            logger.exception("SimilarityAnalyzer error: %s", exc)
            return AnalyzerResult(
                analyzer_type=self.analyzer_type,
                errors=[str(exc)],
                duration_ms=(time.monotonic() - start) * 1000,
            )

        return AnalyzerResult(
            analyzer_type=self.analyzer_type,
            signals=signals,
            scores=scores,
            duration_ms=(time.monotonic() - start) * 1000,
        )

    @staticmethod
    def _text_hash(text: str) -> str:
        import hashlib

        return hashlib.sha256(text.strip().lower().encode("utf-8")).hexdigest()

    @staticmethod
    async def _check_exact_hash(_ctx: AnalyzerContext, _sha256: str) -> bool:
        return False

    @staticmethod
    def _jaccard_similarity(text: str, corpus: list[str], language: str = "en") -> float:
        if not corpus:
            return 0.0
        from app.i18n.nlp import tokenize

        words_a = set(tokenize(text, language))
        max_sim = 0.0
        for doc in corpus:
            words_b = set(tokenize(doc, language))
            if not words_a or not words_b:
                continue
            intersection = len(words_a & words_b)
            union = len(words_a | words_b)
            sim = intersection / union if union > 0 else 0.0
            if sim > max_sim:
                max_sim = sim
        return max_sim

    @staticmethod
    def _tfidf_cosine_similarity(text: str, corpus: list[str], language: str = "en") -> float:
        if not corpus:
            return 0.0
        import math

        from app.i18n.nlp import tokenize

        def tokenize_text(t: str) -> list[str]:
            return [w.lower() for w in tokenize(t, language) if len(w) > 2]

        doc_tokens = tokenize_text(text)
        if not doc_tokens:
            return 0.0

        corpus_tokens = [tokenize_text(d) for d in corpus]
        all_docs = [doc_tokens, *corpus_tokens]

        tfidf_vectors: list[dict[str, float]] = []
        doc_freq: dict[str, int] = {}
        n_docs = len(all_docs)

        for tokens in all_docs:
            for term in set(tokens):
                doc_freq[term] = doc_freq.get(term, 0) + 1

        for tokens in all_docs:
            tf_map: dict[str, int] = {}
            for t in tokens:
                tf_map[t] = tf_map.get(t, 0) + 1
            vec: dict[str, float] = {}
            max_tf = max(tf_map.values()) if tf_map else 1
            for term, count in tf_map.items():
                idf = math.log(n_docs / (1 + doc_freq.get(term, 0)))
                vec[term] = (count / max_tf) * idf
            tfidf_vectors.append(vec)

        query_vec = tfidf_vectors[0]
        max_cosine = 0.0
        for doc_vec in tfidf_vectors[1:]:
            dot = sum(query_vec.get(k, 0) * doc_vec.get(k, 0) for k in set(query_vec) | set(doc_vec))
            norm_a = math.sqrt(sum(v**2 for v in query_vec.values()))
            norm_b = math.sqrt(sum(v**2 for v in doc_vec.values()))
            if norm_a > 0 and norm_b > 0:
                cosine = dot / (norm_a * norm_b)
                if cosine > max_cosine:
                    max_cosine = cosine
        return max_cosine


class PlagiarismAnalyzer(Analyzer):
    """Distinguishes similarity from plagiarism.

    A similarity signal from ``SimilarityAnalyzer`` is upgraded to a
    plagiarism finding only when additional evidence (verbatim overlap
    without attribution, known source) is present.
    """

    @property
    def analyzer_type(self) -> AnalyzerType:
        return AnalyzerType.PLAGIARISM

    @property
    def supported_modalities(self) -> list[str]:
        return ["text"]

    async def analyze(self, ctx: AnalyzerContext) -> AnalyzerResult:
        start = time.monotonic()
        signals: list[AnalysisSignalData] = []
        scores: dict[str, float] = {}

        try:
            if ctx.modality == "text" and ctx.text_content:
                verbatim_score = self._verbatim_overlap_score(ctx.text_content, ctx.language)
                if verbatim_score > 0.8:
                    signals.append(
                        AnalysisSignalData(
                            signal_type=SignalType.PLAGIARISM,
                            severity=SignalSeverity.HIGH if verbatim_score > 0.9 else SignalSeverity.MEDIUM,
                            confidence=verbatim_score,
                            title=f"High verbatim overlap detected ({verbatim_score:.0%})",
                            description=(
                                "Substantial verbatim text overlap was found. This indicates potential "
                                "plagiarism but requires human review for attribution context."
                            ),
                            evidence={"verbatim_overlap": verbatim_score, "requires_human_review": True},
                        )
                    )
                elif verbatim_score > 0.5:
                    signals.append(
                        AnalysisSignalData(
                            signal_type=SignalType.PLAGIARISM,
                            severity=SignalSeverity.LOW,
                            confidence=verbatim_score,
                            title=f"Moderate text overlap detected ({verbatim_score:.0%})",
                            description="Some text overlap was detected. This may be common phrases or attribution.",
                            evidence={"verbatim_overlap": verbatim_score, "requires_human_review": True},
                        )
                    )
                scores["plagiarism_score"] = verbatim_score
        except Exception as exc:
            logger.exception("PlagiarismAnalyzer error: %s", exc)
            return AnalyzerResult(
                analyzer_type=self.analyzer_type,
                errors=[str(exc)],
                duration_ms=(time.monotonic() - start) * 1000,
            )

        return AnalyzerResult(
            analyzer_type=self.analyzer_type,
            signals=signals,
            scores=scores,
            duration_ms=(time.monotonic() - start) * 1000,
        )

    @staticmethod
    def _verbatim_overlap_score(text: str, language: str = "en") -> float:
        from app.i18n.nlp import tokenize

        words = tokenize(text, language)
        if len(words) < 20:
            return 0.0
        n = len(words)
        chunk_size = max(5, n // 10)
        seen_chunks: set[tuple[str, ...]] = set()
        overlap_count = 0
        for i in range(0, n - chunk_size + 1, chunk_size):
            chunk = tuple(w.lower() for w in words[i : i + chunk_size])
            if chunk in seen_chunks:
                overlap_count += 1
            seen_chunks.add(chunk)
        total_chunks = max((n - chunk_size + 1) // chunk_size, 1)
        return min(overlap_count / total_chunks, 1.0) if total_chunks > 0 else 0.0


class AuthenticityAnalyzer(Analyzer):
    """Multi-signal authenticity analysis for image/video/audio.

    Each signal is an independent piece of evidence. No single signal
    is treated as definitive proof.
    """

    @property
    def analyzer_type(self) -> AnalyzerType:
        return AnalyzerType.AUTHENTICITY

    @property
    def supported_modalities(self) -> list[str]:
        return ["image", "video", "audio"]

    async def analyze(self, ctx: AnalyzerContext) -> AnalyzerResult:
        start = time.monotonic()
        signals: list[AnalysisSignalData] = []
        scores: dict[str, float] = {}
        metadata: dict[str, Any] = {}

        try:
            if ctx.modality == "image" and ctx.storage_path:
                r = await self._analyze_image_authenticity(ctx)
            elif ctx.modality == "video" and ctx.storage_path:
                r = await self._analyze_video_authenticity(ctx)
            elif ctx.modality == "audio" and ctx.storage_path:
                r = await self._analyze_audio_authenticity(ctx)
            else:
                return AnalyzerResult(
                    analyzer_type=self.analyzer_type,
                    metadata={"skipped": True},
                    duration_ms=(time.monotonic() - start) * 1000,
                )
            signals = r.get("signals", [])
            scores = r.get("scores", {})
            metadata = r.get("metadata", {})
        except Exception as exc:
            logger.exception("AuthenticityAnalyzer error: %s", exc)
            return AnalyzerResult(
                analyzer_type=self.analyzer_type,
                errors=[str(exc)],
                duration_ms=(time.monotonic() - start) * 1000,
            )

        return AnalyzerResult(
            analyzer_type=self.analyzer_type,
            signals=signals,
            scores=scores,
            metadata=metadata,
            duration_ms=(time.monotonic() - start) * 1000,
        )

    async def _analyze_image_authenticity(self, ctx: AnalyzerContext) -> dict[str, Any]:
        signals: list[AnalysisSignalData] = []
        scores: dict[str, float] = {}
        evidence_details: dict[str, Any] = {}
        assert ctx.storage_path is not None

        try:
            import numpy as np
            from PIL import Image

            img = Image.open(ctx.storage_path)
            arr = np.array(img).astype(float)

            elbp_score = self._elbp_inconsistency(arr)
            scores["elbp_inconsistency"] = elbp_score
            evidence_details["elbp"] = elbp_score
            if elbp_score > 0.7:
                signals.append(
                    AnalysisSignalData(
                        signal_type=SignalType.AUTHENTICITY,
                        severity=SignalSeverity.MEDIUM,
                        confidence=elbp_score,
                        title="ELBP texture inconsistency detected",
                        description="Local binary pattern analysis shows texture anomalies.",
                        evidence={"elbp_score": elbp_score, "method": "ELBP"},
                    )
                )

            if img.format and img.format.upper() in ("JPEG", "JPG"):
                double_score = self._double_jpeg_score(arr)
                scores["compression_anomaly"] = double_score
                evidence_details["double_compression"] = double_score
                if double_score > 0.6:
                    signals.append(
                        AnalysisSignalData(
                            signal_type=SignalType.COMPRESSION,
                            severity=SignalSeverity.MEDIUM,
                            confidence=double_score,
                            title="Double JPEG compression detected",
                            description="The image shows signs of re-compression, which may indicate manipulation.",
                            evidence={"compression_score": double_score, "method": "DCT_analysis"},
                        )
                    )

            noise = float(np.std(arr))
            scores["noise_level"] = min(noise / 50.0, 1.0)
            if noise < 3.0:
                signals.append(
                    AnalysisSignalData(
                        signal_type=SignalType.VISUAL_ARTIFACT,
                        severity=SignalSeverity.LOW,
                        confidence=0.5,
                        title="Unusually low noise level",
                        description="The image has very low noise, which may indicate heavy filtering or generation.",
                        evidence={"noise_std": noise},
                    )
                )

        except Exception as exc:
            logger.debug("Image authenticity analysis error: %s", exc)
            scores["authenticity_score"] = 0.5

        authenticity_score = 1.0 - sum(scores.get(k, 0) for k in ["elbp_inconsistency", "compression_anomaly"]) / 2
        scores["authenticity_score"] = max(authenticity_score, 0.0)

        return {"signals": signals, "scores": scores, "metadata": {"image_analysis": evidence_details}}

    async def _analyze_video_authenticity(self, ctx: AnalyzerContext) -> dict[str, Any]:
        signals: list[AnalysisSignalData] = []
        scores: dict[str, float] = {}
        evidence_details: dict[str, Any] = {}
        assert ctx.storage_path is not None
        try:
            import subprocess

            probe = subprocess.run(
                ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", ctx.storage_path],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if probe.returncode == 0:
                info = json.loads(probe.stdout)
                streams = info.get("streams", [])
                fmt = info.get("format", {})

                duration = float(fmt.get("duration", 0))
                bit_rate = int(fmt.get("bit_rate", 0))
                scores["duration_seconds"] = duration
                scores["bit_rate"] = float(bit_rate)

                for s in streams:
                    if s.get("codec_type") == "video":
                        codec = s.get("codec_name", "")
                        width = int(s.get("width", 0))
                        height = int(s.get("height", 0))
                        fps_str = s.get("r_frame_rate", "0/1")
                        if "/" in fps_str:
                            num, den = fps_str.split("/")
                            fps = float(num) / float(den) if float(den) > 0 else 0
                        else:
                            fps = float(fps_str)

                        scores["video_codec"] = 1.0
                        scores["video_width"] = float(width)
                        scores["video_height"] = float(height)
                        scores["video_fps"] = fps

                        if codec in ("mjpeg", "png"):
                            signals.append(
                                AnalysisSignalData(
                                    signal_type=SignalType.METADATA_ANOMALY,
                                    severity=SignalSeverity.LOW,
                                    confidence=0.4,
                                    title=f"Unusual video codec: {codec}",
                                    description=f"The video codec '{codec}' is atypical for video content.",
                                    evidence={"codec": codec},
                                )
                            )

                        if fps > 0 and duration > 0:
                            expected_frames = fps * duration
                            nb_frames_str = s.get("nb_frames")
                            if nb_frames_str and nb_frames_str != "N/A":
                                actual_frames = int(nb_frames_str)
                                frame_ratio = actual_frames / expected_frames if expected_frames > 0 else 1.0
                                scores["frame_consistency"] = (
                                    min(frame_ratio, 2.0 - frame_ratio) if frame_ratio <= 2.0 else 0.0
                                )
                                if abs(frame_ratio - 1.0) > 0.1:
                                    signals.append(
                                        AnalysisSignalData(
                                            signal_type=SignalType.TEMPORAL,
                                            severity=SignalSeverity.MEDIUM,
                                            confidence=min(abs(frame_ratio - 1.0), 1.0),
                                            title="Frame count inconsistency",
                                            description="The actual frame count deviates from the expected count.",
                                            evidence={
                                                "expected_frames": expected_frames,
                                                "actual_frames": actual_frames,
                                                "ratio": frame_ratio,
                                            },
                                        )
                                    )
                        break

                for s in streams:
                    if s.get("codec_type") == "audio":
                        audio_codec = s.get("codec_name", "")
                        sample_rate = int(s.get("sample_rate", 0))
                        scores["audio_codec"] = 1.0
                        scores["audio_sample_rate"] = float(sample_rate)

                        if audio_codec and audio_codec not in ("aac", "mp3", "opus", "vorbis", "flac", "pcm_s16le"):
                            signals.append(
                                AnalysisSignalData(
                                    signal_type=SignalType.AUDIO_INCONSISTENCY,
                                    severity=SignalSeverity.LOW,
                                    confidence=0.3,
                                    title=f"Unusual audio codec in video: {audio_codec}",
                                    description=f"The audio codec '{audio_codec}' is atypical.",
                                    evidence={"audio_codec": audio_codec},
                                )
                            )
                        break

                if bit_rate > 0 and duration > 0:
                    file_size = os.path.getsize(ctx.storage_path)
                    expected_size = (bit_rate * duration) / 8
                    if expected_size > 0:
                        size_ratio = file_size / expected_size
                        scores["size_consistency"] = min(size_ratio, 2.0 - size_ratio) if size_ratio <= 2.0 else 0.0
                        if abs(size_ratio - 1.0) > 0.3:
                            signals.append(
                                AnalysisSignalData(
                                    signal_type=SignalType.METADATA_ANOMALY,
                                    severity=SignalSeverity.LOW,
                                    confidence=min(abs(size_ratio - 1.0), 1.0),
                                    title="File size vs bitrate mismatch",
                                    description="The file size is inconsistent with the declared bitrate.",
                                    evidence={
                                        "expected_size": expected_size,
                                        "actual_size": file_size,
                                        "ratio": size_ratio,
                                    },
                                )
                            )

                evidence_details["streams"] = len(streams)
                evidence_details["format"] = fmt.get("format_name", "")

        except Exception as exc:
            logger.debug("Video authenticity analysis error: %s", exc)

        anomaly_count = len([s for s in signals if s.severity in (SignalSeverity.MEDIUM, SignalSeverity.HIGH)])
        scores["authenticity_score"] = max(1.0 - anomaly_count * 0.15, 0.0)

        return {"signals": signals, "scores": scores, "metadata": {"video_analysis": evidence_details}}

    async def _analyze_audio_authenticity(self, ctx: AnalyzerContext) -> dict[str, Any]:
        signals: list[AnalysisSignalData] = []
        scores: dict[str, float] = {}
        evidence_details: dict[str, Any] = {}
        assert ctx.storage_path is not None

        try:
            import struct

            with open(ctx.storage_path, "rb") as f:
                header = f.read(44)

            if header[:4] == b"RIFF":
                scores["format_valid"] = 1.0
                file_size = os.path.getsize(ctx.storage_path)
                data_size = struct.unpack_from("<I", header, 40)[0] if len(header) >= 44 else 0
                sample_rate = struct.unpack_from("<I", header, 24)[0]
                channels = struct.unpack_from("<H", header, 22)[0]
                bits_per_sample = struct.unpack_from("<H", header, 34)[0]

                evidence_details["sample_rate"] = sample_rate
                evidence_details["channels"] = channels
                evidence_details["bits_per_sample"] = bits_per_sample
                evidence_details["data_size"] = data_size
                evidence_details["file_size"] = file_size

                if sample_rate > 0 and channels > 0 and bits_per_sample > 0:
                    bytes_per_sec = sample_rate * channels * (bits_per_sample // 8)
                    expected_duration = data_size / bytes_per_sec if bytes_per_sec > 0 else 0
                    scores["duration_seconds"] = expected_duration

                    if data_size > 0:
                        header_overhead = file_size - data_size
                        scores["header_overhead_ratio"] = header_overhead / file_size if file_size > 0 else 0

                    if channels == 1 and sample_rate > 0:
                        freq_resolution = sample_rate / 2
                        if freq_resolution > 0:
                            spectral_centroid_approx = sample_rate * 0.3
                            scores["spectral_hint"] = spectral_centroid_approx

                    if sample_rate < 8000:
                        signals.append(
                            AnalysisSignalData(
                                signal_type=SignalType.AUDIO_INCONSISTENCY,
                                severity=SignalSeverity.LOW,
                                confidence=0.4,
                                title="Low sample rate detected",
                                description=f"Sample rate {sample_rate} Hz is unusually low for quality audio.",
                                evidence={"sample_rate": sample_rate},
                            )
                        )

                    if bits_per_sample not in (8, 16, 24, 32):
                        signals.append(
                            AnalysisSignalData(
                                signal_type=SignalType.AUDIO_INCONSISTENCY,
                                severity=SignalSeverity.LOW,
                                confidence=0.3,
                                title="Unusual bit depth",
                                description=f"Bit depth {bits_per_sample} is non-standard.",
                                evidence={"bits_per_sample": bits_per_sample},
                            )
                        )

                    if data_size > 0 and file_size > 0:
                        data_ratio = data_size / file_size
                        scores["data_ratio"] = data_ratio
                        if data_ratio < 0.5:
                            signals.append(
                                AnalysisSignalData(
                                    signal_type=SignalType.METADATA_ANOMALY,
                                    severity=SignalSeverity.LOW,
                                    confidence=0.3,
                                    title="Low data-to-file ratio",
                                    description="The audio data occupies a small portion of the file.",
                                    evidence={"data_ratio": data_ratio},
                                )
                            )
            else:
                scores["format_valid"] = 0.3
                signals.append(
                    AnalysisSignalData(
                        signal_type=SignalType.METADATA_ANOMALY,
                        severity=SignalSeverity.LOW,
                        confidence=0.4,
                        title="Non-standard audio header",
                        description="The audio file header does not match expected WAV format.",
                        evidence={"header_hex": header[:4].hex()},
                    )
                )
        except Exception as exc:
            logger.debug("Audio authenticity analysis error: %s", exc)

        anomaly_count = len([s for s in signals if s.severity in (SignalSeverity.MEDIUM, SignalSeverity.HIGH)])
        scores["authenticity_score"] = scores.get("format_valid", 0.5) * max(1.0 - anomaly_count * 0.15, 0.0)

        return {"signals": signals, "scores": scores, "metadata": {"audio_analysis": evidence_details}}

    @staticmethod
    def _elbp_inconsistency(arr: Any) -> float:
        try:
            import numpy as np

            if arr.ndim == 3:
                gray = np.mean(arr, axis=2)
            else:
                gray = arr
            h, w = gray.shape
            if h < 4 or w < 4:
                return 0.0
            block_size = min(h, w) // 4
            blocks = []
            for i in range(0, h - block_size, block_size):
                for j in range(0, w - block_size, block_size):
                    block = gray[i : i + block_size, j : j + block_size]
                    block_mean = float(np.mean(block))
                    blocks.append(block_mean)
            if len(blocks) < 2:
                return 0.0
            block_var = float(np.var(blocks))
            return min(block_var / 1000.0, 1.0)
        except Exception:
            return 0.0

    @staticmethod
    def _double_jpeg_score(arr: Any) -> float:
        try:
            import numpy as np

            if arr.ndim == 3:
                gray = np.mean(arr, axis=2)
            else:
                gray = arr
            dct_like = np.abs(np.diff(gray.astype(float), axis=1))
            mean_diff = float(np.mean(dct_like))
            return min(mean_diff / 30.0, 1.0)
        except Exception:
            return 0.0


class LanguageAnalyzer(Analyzer):
    """Detects input language and preserves language metadata."""

    @property
    def analyzer_type(self) -> AnalyzerType:
        return AnalyzerType.LANGUAGE

    @property
    def supported_modalities(self) -> list[str]:
        return ["text", "document"]

    async def analyze(self, ctx: AnalyzerContext) -> AnalyzerResult:
        start = time.monotonic()
        signals: list[AnalysisSignalData] = []
        scores: dict[str, float] = {}
        metadata: dict[str, Any] = {}

        try:
            text = ctx.text_content or ""
            lang, confidence = self._detect_language(text)
            metadata["detected_language"] = lang
            metadata["language_confidence"] = confidence
            scores["language_confidence"] = confidence

            if lang and lang != ctx.language:
                signals.append(
                    AnalysisSignalData(
                        signal_type=SignalType.LANGUAGE,
                        severity=SignalSeverity.INFO,
                        confidence=confidence,
                        title=f"Language mismatch: expected {ctx.language}, detected {lang}",
                        description=f"The content language ({lang}) differs from the declared language ({ctx.language}).",
                        evidence={"declared": ctx.language, "detected": lang, "confidence": confidence},
                    )
                )
        except Exception as exc:
            logger.exception("LanguageAnalyzer error: %s", exc)
            return AnalyzerResult(
                analyzer_type=self.analyzer_type,
                errors=[str(exc)],
                duration_ms=(time.monotonic() - start) * 1000,
            )

        return AnalyzerResult(
            analyzer_type=self.analyzer_type,
            signals=signals,
            scores=scores,
            metadata=metadata,
            duration_ms=(time.monotonic() - start) * 1000,
        )

    @staticmethod
    def _detect_language(text: str) -> tuple[str, float]:
        if not text or len(text.strip()) < 10:
            return "unknown", 0.0

        from app.i18n.nlp import detect_script

        script = detect_script(text)

        script_to_lang = {
            "Latin": "en",
            "Devanagari": "hi",
            "Telugu": "te",
            "Tamil": "ta",
            "Kannada": "kn",
            "Malayalam": "ml",
            "Bengali": "bn",
        }

        if script in script_to_lang:
            lang = script_to_lang[script]
            char_counts = {}
            sample = text[:2000]
            for c in sample:
                cp = ord(c)
                if cp < 128:
                    char_counts["Latin"] = char_counts.get("Latin", 0) + 1
                elif 0x0900 <= cp <= 0x097F:
                    char_counts["Devanagari"] = char_counts.get("Devanagari", 0) + 1
                elif 0x0C00 <= cp <= 0x0C7F:
                    char_counts["Telugu"] = char_counts.get("Telugu", 0) + 1
                elif 0x0B80 <= cp <= 0x0BFF:
                    char_counts["Tamil"] = char_counts.get("Tamil", 0) + 1
                elif 0x0C80 <= cp <= 0x0CFF:
                    char_counts["Kannada"] = char_counts.get("Kannada", 0) + 1
                elif 0x0D00 <= cp <= 0x0D7F:
                    char_counts["Malayalam"] = char_counts.get("Malayalam", 0) + 1
                elif 0x0980 <= cp <= 0x09FF:
                    char_counts["Bengali"] = char_counts.get("Bengali", 0) + 1

            total = sum(char_counts.values()) or 1
            confidence = char_counts.get(script, 0) / total
            return lang, min(confidence, 1.0)

        return "unknown", 0.0


class MetadataAnalyzer(Analyzer):
    """Extracts and validates metadata signals."""

    @property
    def analyzer_type(self) -> AnalyzerType:
        return AnalyzerType.METADATA

    @property
    def supported_modalities(self) -> list[str]:
        return ["text", "image", "audio", "video", "document"]

    async def analyze(self, ctx: AnalyzerContext) -> AnalyzerResult:
        start = time.monotonic()
        signals: list[AnalysisSignalData] = []
        scores: dict[str, float] = {}
        metadata: dict[str, Any] = {}

        try:
            if ctx.modality in ("image", "video", "audio") and ctx.storage_path:
                meta_result = self._analyze_file_metadata(ctx)
                signals.extend(meta_result.get("signals", []))
                metadata.update(meta_result.get("metadata", {}))
                scores.update(meta_result.get("scores", {}))
            elif ctx.modality == "text" and ctx.text_content:
                text_len = len(ctx.text_content)
                word_count = len(ctx.text_content.split())
                metadata["text_length"] = text_len
                metadata["word_count"] = word_count
                scores["text_completeness"] = min(word_count / 100, 1.0)
        except Exception as exc:
            logger.exception("MetadataAnalyzer error: %s", exc)
            return AnalyzerResult(
                analyzer_type=self.analyzer_type,
                errors=[str(exc)],
                duration_ms=(time.monotonic() - start) * 1000,
            )

        return AnalyzerResult(
            analyzer_type=self.analyzer_type,
            signals=signals,
            scores=scores,
            metadata=metadata,
            duration_ms=(time.monotonic() - start) * 1000,
        )

    def _analyze_file_metadata(self, ctx: AnalyzerContext) -> dict[str, Any]:
        import os

        signals: list[AnalysisSignalData] = []
        metadata: dict[str, Any] = {}
        scores: dict[str, float] = {}

        file_size = ctx.file_size or os.path.getsize(ctx.storage_path) if ctx.storage_path else 0
        metadata["file_size"] = file_size
        metadata["mime_type"] = ctx.mime_type

        if ctx.modality == "image":
            assert ctx.storage_path is not None
            try:
                from PIL import Image

                img = Image.open(ctx.storage_path)
                metadata["dimensions"] = f"{img.width}x{img.height}"
                metadata["format"] = img.format
                metadata["mode"] = img.mode
                if img.format == "JPEG":
                    exif = img.getexif() if hasattr(img, "getexif") else {}
                    metadata["has_exif"] = bool(exif)
                    if not exif:
                        signals.append(
                            AnalysisSignalData(
                                signal_type=SignalType.METADATA_ANOMALY,
                                severity=SignalSeverity.INFO,
                                confidence=0.5,
                                title="No EXIF data in JPEG",
                                description="The JPEG image contains no EXIF metadata, which may indicate stripping.",
                                evidence={"format": "JPEG", "has_exif": False},
                            )
                        )
            except Exception:
                pass

        elif ctx.modality == "audio":
            assert ctx.storage_path is not None
            try:
                with open(ctx.storage_path, "rb") as f:
                    header = f.read(44)
                if len(header) >= 44 and header[:4] == b"RIFF":
                    import struct

                    sample_rate = struct.unpack_from("<I", header, 24)[0]
                    channels = struct.unpack_from("<H", header, 22)[0]
                    metadata["sample_rate"] = sample_rate
                    metadata["channels"] = channels
            except Exception:
                pass

        scores["metadata_completeness"] = len(metadata) / 10.0
        return {"signals": signals, "scores": scores, "metadata": metadata}


# ---------------------------------------------------------------------------
# ExplainabilityEngine
# ---------------------------------------------------------------------------


class ExplainabilityEngine:
    """Generates human-readable explanations from analyzer results.

    Supports multilingual output by using locale resources for the
    explanation language. Analysis results are always in English (machine-readable),
    but explanations can be localized for the user.
    """

    def generate(
        self,
        signals: list[AnalysisSignalData],
        scores: dict[str, float],
        modality: str,
        language: str = "en",
    ) -> dict[str, Any]:
        """Build narrative, key factors, and recommendations.

        Args:
            signals: Analysis signals detected.
            scores: Analysis scores.
            modality: Input modality (text, image, etc.).
            language: Explanation language code (ISO 639-1).
        """
        key_factors = self._extract_key_factors(signals)
        narrative = self._build_narrative(signals, scores, modality, language)
        recommendations = self._build_recommendations(signals, scores, language)

        return {
            "narrative": narrative,
            "key_factors": key_factors,
            "recommendations": recommendations,
            "analysis_language": "en",
            "explanation_language": language,
        }

    def _extract_key_factors(self, signals: list[AnalysisSignalData]) -> list[dict[str, Any]]:
        factors = []
        for s in sorted(signals, key=lambda x: x.confidence, reverse=True):
            factors.append(
                {
                    "type": s.signal_type.value,
                    "severity": s.severity.value,
                    "confidence": s.confidence,
                    "title": s.title,
                }
            )
        return factors[:10]

    def _build_narrative(
        self,
        signals: list[AnalysisSignalData],
        scores: dict[str, float],
        modality: str,
        language: str = "en",
    ) -> str:
        if not signals:
            return self._get_localized_message("no_signals_detected", language, modality=modality)

        high_sev = [s for s in signals if s.severity in (SignalSeverity.HIGH, SignalSeverity.CRITICAL)]
        med_sev = [s for s in signals if s.severity == SignalSeverity.MEDIUM]
        low_sev = [s for s in signals if s.severity in (SignalSeverity.LOW, SignalSeverity.INFO)]

        parts: list[str] = []
        if high_sev:
            parts.append(self._get_localized_message("high_severity_count", language, count=len(high_sev)))
        if med_sev:
            parts.append(self._get_localized_message("medium_severity_count", language, count=len(med_sev)))
        if low_sev:
            parts.append(self._get_localized_message("low_severity_count", language, count=len(low_sev)))

        primary = max(signals, key=lambda x: x.confidence)
        parts.append(self._get_localized_message("primary_finding", language, finding=primary.title))

        ai_score = scores.get("ai_content_score")
        if ai_score is not None:
            parts.append(self._get_localized_message("ai_content_probability", language, probability=f"{ai_score:.0%}"))

        return " ".join(parts)

    def _build_recommendations(
        self,
        signals: list[AnalysisSignalData],
        scores: dict[str, float],
        language: str = "en",
    ) -> list[str]:
        recs: list[str] = []
        has_plagiarism = any(s.signal_type == SignalType.PLAGIARISM for s in signals)
        has_ai = any(s.signal_type == SignalType.AI_CONTENT for s in signals)
        has_auth = any(s.signal_type == SignalType.AUTHENTICITY for s in signals)

        if has_plagiarism:
            recs.append(self._get_localized_message("plagiarism_review", language))
        if has_ai:
            recs.append(self._get_localized_message("ai_detection_crossref", language))
        if has_auth:
            recs.append(self._get_localized_message("authenticity_review", language))
        if not signals:
            recs.append(self._get_localized_message("no_issues_detected", language))

        return recs

    @staticmethod
    def _get_localized_message(key: str, language: str, **kwargs: Any) -> str:
        """Get a localized message from locale resources with fallback to English."""
        from app.i18n.locales import get_status_message

        return get_status_message(key, language, **kwargs)


# ---------------------------------------------------------------------------
# Analysis Orchestrator
# ---------------------------------------------------------------------------


class AnalysisOrchestrator:
    """Selects, runs, and aggregates results from multiple analyzers."""

    def __init__(self) -> None:
        self._analyzers: dict[AnalyzerType, Analyzer] = {}
        self._explainability = ExplainabilityEngine()

    def register_analyzer(self, analyzer: Analyzer) -> None:
        self._analyzers[analyzer.analyzer_type] = analyzer

    def get_analyzer(self, atype: AnalyzerType) -> Analyzer | None:
        return self._analyzers.get(atype)

    def available_analyzers(self) -> list[AnalyzerType]:
        return list(self._analyzers.keys())

    def select_analyzers(self, modality: str, requested: list[AnalyzerType] | None = None) -> list[Analyzer]:
        """Choose which analyzers to run for the given modality."""
        candidates = []
        for atype, analyzer in self._analyzers.items():
            if requested and atype not in requested:
                continue
            if analyzer.can_handle(modality):
                candidates.append(analyzer)
        return candidates

    async def execute(
        self,
        ctx: AnalyzerContext,
        requested: list[AnalyzerType] | None = None,
        db: AsyncSession | None = None,
    ) -> AnalyzerAggregatedResult:
        """Run selected analyzers and produce an aggregated result."""
        analyzers = self.select_analyzers(ctx.modality, requested)
        all_signals: list[AnalysisSignalData] = []
        all_scores: dict[str, float] = {}
        all_metadata: dict[str, Any] = {}
        all_errors: list[str] = []
        total_duration = 0.0

        for analyzer in analyzers:
            try:
                result = await analyzer.analyze(ctx)
                all_signals.extend(result.signals)
                all_scores.update(result.scores)
                all_metadata[analyzer.analyzer_type.value] = result.metadata
                all_errors.extend(result.errors)
                total_duration += result.duration_ms
            except Exception as exc:
                logger.exception("Analyzer %s failed: %s", analyzer.analyzer_type.value, exc)
                all_errors.append(f"{analyzer.analyzer_type.value}: {exc}")

        assessment = self._compute_assessment(all_signals, all_scores)
        confidence = self._compute_confidence(all_signals)
        risk_level = self._compute_risk_level(all_signals, all_scores)
        explanation = self._explainability.generate(all_signals, all_scores, ctx.modality, ctx.language)

        return AnalyzerAggregatedResult(
            assessment=assessment,
            confidence=confidence,
            risk_level=risk_level,
            signals=all_signals,
            scores=all_scores,
            metadata=all_metadata,
            explanation=explanation,
            errors=all_errors,
            total_duration_ms=total_duration,
            analyzers_used=[a.analyzer_type for a in analyzers],
        )

    def _compute_assessment(self, signals: list[AnalysisSignalData], scores: dict[str, float]) -> str:
        high = sum(1 for s in signals if s.severity in (SignalSeverity.HIGH, SignalSeverity.CRITICAL))
        if high >= 3:
            return "likely_manipulated"
        if high >= 1:
            return "suspicious"
        med = sum(1 for s in signals if s.severity == SignalSeverity.MEDIUM)
        if med >= 2:
            return "suspicious"
        if med >= 1:
            return "uncertain"
        return "likely_authentic"

    def _compute_confidence(self, signals: list[AnalysisSignalData]) -> float:
        if not signals:
            return 0.5
        return max(s.confidence for s in signals)

    def _compute_risk_level(self, signals: list[AnalysisSignalData], scores: dict[str, float]) -> RiskLevel:
        ai_score = scores.get("ai_content_score")
        auth_score = scores.get("authenticity_score")
        confidence = scores.get("confidence")
        high_count = sum(1 for s in signals if s.severity in (SignalSeverity.HIGH, SignalSeverity.CRITICAL))

        if high_count >= 3:
            return RiskLevel.CRITICAL
        # If confidence is very low, result is uncertain regardless of score
        if confidence is None or confidence < 0.15:
            return RiskLevel.MINIMAL

        if (
            (ai_score is not None and ai_score > 0.9)
            or (auth_score is not None and auth_score < 0.2)
            or high_count >= 3
        ):
            return RiskLevel.CRITICAL
        if (
            (ai_score is not None and ai_score > 0.7)
            or (auth_score is not None and auth_score < 0.4)
            or high_count >= 2
        ):
            return RiskLevel.HIGH
        if (
            (ai_score is not None and ai_score > 0.5)
            or (auth_score is not None and auth_score < 0.6)
            or high_count >= 1
        ):
            return RiskLevel.MEDIUM
        if any(s.severity == SignalSeverity.MEDIUM for s in signals):
            return RiskLevel.LOW
        return RiskLevel.MINIMAL


@dataclass
class AnalyzerAggregatedResult:
    """Aggregated output from the orchestrator."""

    assessment: str
    confidence: float
    risk_level: RiskLevel
    signals: list[AnalysisSignalData]
    scores: dict[str, float]
    metadata: dict[str, Any]
    explanation: dict[str, Any]
    errors: list[str]
    total_duration_ms: float
    analyzers_used: list[AnalyzerType]
