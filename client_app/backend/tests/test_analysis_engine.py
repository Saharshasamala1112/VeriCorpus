"""Tests for the AI analysis orchestration layer."""

from __future__ import annotations

import struct
import tempfile
from unittest.mock import MagicMock

from app.models.analysis import (
    AnalysisPriority,
    AnalysisStatus,
    AnalyzerType,
    ModelFramework,
    ModelProviderStatus,
    RiskLevel,
    SignalSeverity,
    SignalType,
)
from app.services.analysis_engine import (
    AIContentAnalyzer,
    AnalysisOrchestrator,
    AnalysisSignalData,
    Analyzer,
    AnalyzerAggregatedResult,
    AnalyzerContext,
    AnalyzerResult,
    AuthenticityAnalyzer,
    ExplainabilityEngine,
    LanguageAnalyzer,
    MetadataAnalyzer,
    PlagiarismAnalyzer,
    SimilarityAnalyzer,
)
from app.services.model_registry import (
    InferenceInput,
    MockInferenceProvider,
    MockModelProvider,
    ModelMetadata,
    ModelRegistryService,
)


def _mock_job(text="", modality="text", language="en"):
    job = MagicMock()
    job.id = "test-job-001"
    job.user_id = "user-001"
    job.modality = modality
    job.status = AnalysisStatus.PENDING.value
    job.priority = AnalysisPriority.NORMAL.value
    job.input_text = text
    return job


class TestAnalyzerInterface:
    def test_analyzer_has_required_properties(self):
        analyzer = AIContentAnalyzer()
        assert isinstance(analyzer.analyzer_type, AnalyzerType)
        assert isinstance(analyzer.supported_modalities, list)
        assert len(analyzer.supported_modalities) > 0

    def test_can_handle_modality(self):
        analyzer = AIContentAnalyzer()
        assert analyzer.can_handle("text")
        assert analyzer.can_handle("image")
        assert not analyzer.can_handle("unknown")

    def test_required_models_returns_list(self):
        analyzer = AIContentAnalyzer()
        models = analyzer.required_models()
        assert isinstance(models, list)

    def test_analyzer_result_dataclass(self):
        result = AnalyzerResult(analyzer_type=AnalyzerType.AI_CONTENT)
        assert result.analyzer_type == AnalyzerType.AI_CONTENT
        assert result.signals == []
        assert result.scores == {}
        assert result.errors == []
        assert result.duration_ms == 0.0


class TestAIContentAnalyzer:
    async def test_text_ai_detection_short_text(self):
        analyzer = AIContentAnalyzer()
        ctx = AnalyzerContext(job=_mock_job(), modality="text", text_content="Hello world")
        result = await analyzer.analyze(ctx)
        assert result.analyzer_type == AnalyzerType.AI_CONTENT
        assert result.duration_ms >= 0

    async def test_text_ai_detection_long_text(self):
        analyzer = AIContentAnalyzer()
        long_text = "Furthermore, moreover, consequently, additionally, subsequently " * 50
        ctx = AnalyzerContext(job=_mock_job(), modality="text", text_content=long_text)
        result = await analyzer.analyze(ctx)
        assert result.analyzer_type == AnalyzerType.AI_CONTENT
        assert len(result.signals) > 0

    async def test_text_ai_detection_no_text(self):
        analyzer = AIContentAnalyzer()
        ctx = AnalyzerContext(job=_mock_job(), modality="text", text_content=None)
        result = await analyzer.analyze(ctx)
        assert result.analyzer_type == AnalyzerType.AI_CONTENT

    async def test_image_ai_detection_no_file(self):
        analyzer = AIContentAnalyzer()
        ctx = AnalyzerContext(job=_mock_job(modality="image"), modality="image", storage_path=None)
        result = await analyzer.analyze(ctx)
        assert result.metadata.get("skipped") is True

    async def test_image_ai_detection_with_image(self):
        analyzer = AIContentAnalyzer()
        with tempfile.NamedTemporaryFile(suffix=".png") as f:
            from PIL import Image

            img = Image.new("RGB", (100, 100), color=(128, 128, 128))
            img.save(f.name, format="PNG")
            f.flush()
            ctx = AnalyzerContext(job=_mock_job(modality="image"), modality="image", storage_path=f.name)
            result = await analyzer.analyze(ctx)
            assert result.analyzer_type == AnalyzerType.AI_CONTENT
            assert "noise_analysis" in result.scores or "ai_content_score" in result.scores

    async def test_audio_ai_detection(self):
        analyzer = AIContentAnalyzer()
        with tempfile.NamedTemporaryFile(suffix=".wav") as f:
            sample_rate = 44100
            channels = 1
            bits_per_sample = 16
            data_size = 1000
            header = struct.pack(
                "<4sI4s4sIHHIIHH4sI",
                b"RIFF",
                36 + data_size,
                b"WAVE",
                b"fmt ",
                16,
                1,
                channels,
                sample_rate,
                sample_rate * channels * (bits_per_sample // 8),
                channels * (bits_per_sample // 8),
                bits_per_sample,
                b"data",
                data_size,
            )
            f.write(header + b"\x00" * data_size)
            f.flush()
            ctx = AnalyzerContext(job=_mock_job(modality="audio"), modality="audio", storage_path=f.name)
            result = await analyzer.analyze(ctx)
            assert result.analyzer_type == AnalyzerType.AI_CONTENT
            assert "ai_content_score" in result.scores

    async def test_unsupported_modality_returns_skipped(self):
        analyzer = AIContentAnalyzer()
        ctx = AnalyzerContext(job=_mock_job(modality="unknown"), modality="unknown", text_content="test")
        result = await analyzer.analyze(ctx)
        assert result.metadata.get("skipped") is True


class TestSimilarityAnalyzer:
    async def test_exact_hash_match(self):
        analyzer = SimilarityAnalyzer()
        text = "The quick brown fox jumps over the lazy dog"
        ctx = AnalyzerContext(job=_mock_job(), modality="text", text_content=text)
        result = await analyzer.analyze(ctx)
        assert result.analyzer_type == AnalyzerType.SIMILARITY

    async def test_no_match_empty_corpus(self):
        analyzer = SimilarityAnalyzer(reference_corpus=[])
        text = "Hello world this is a test document with enough words"
        ctx = AnalyzerContext(job=_mock_job(), modality="text", text_content=text)
        result = await analyzer.analyze(ctx)
        assert result.analyzer_type == AnalyzerType.SIMILARITY
        assert result.scores.get("jaccard_similarity", 0) == 0.0

    async def test_high_jaccard_similarity(self):
        corpus = ["the quick brown fox jumps over the lazy dog in the field"]
        analyzer = SimilarityAnalyzer(reference_corpus=corpus)
        text = "the quick brown fox jumps over the lazy dog in the area"
        ctx = AnalyzerContext(job=_mock_job(), modality="text", text_content=text)
        result = await analyzer.analyze(ctx)
        assert "jaccard_similarity" in result.scores
        assert result.scores["jaccard_similarity"] > 0.5

    async def test_semantic_similarity(self):
        corpus = ["machine learning algorithms are used for data analysis"]
        analyzer = SimilarityAnalyzer(reference_corpus=corpus)
        text = "machine learning algorithms are used for data analysis"
        ctx = AnalyzerContext(job=_mock_job(), modality="text", text_content=text)
        result = await analyzer.analyze(ctx)
        assert "semantic_similarity" in result.scores
        assert result.scores["semantic_similarity"] > 0.8

    def test_jaccard_similarity_identical(self):
        text = "hello world foo bar"
        corpus = ["hello world foo bar"]
        sim = SimilarityAnalyzer._jaccard_similarity(text, corpus)
        assert sim == 1.0

    def test_jaccard_similarity_disjoint(self):
        text = "alpha bravo charlie"
        corpus = ["delta echo foxtrot"]
        sim = SimilarityAnalyzer._jaccard_similarity(text, corpus)
        assert sim == 0.0

    def test_jaccard_similarity_empty_corpus(self):
        sim = SimilarityAnalyzer._jaccard_similarity("test", [])
        assert sim == 0.0

    def test_tfidf_cosine_identical(self):
        text = "hello world foo bar baz"
        corpus = ["hello world foo bar baz"]
        sim = SimilarityAnalyzer._tfidf_cosine_similarity(text, corpus)
        assert sim > 0.99

    def test_tfidf_cosine_disjoint(self):
        text = "alpha bravo charlie delta"
        corpus = ["echo foxtrot golf hotel india"]
        sim = SimilarityAnalyzer._tfidf_cosine_similarity(text, corpus)
        assert sim < 0.1

    def test_tfidf_cosine_empty_corpus(self):
        sim = SimilarityAnalyzer._tfidf_cosine_similarity("test", [])
        assert sim == 0.0

    def test_text_hash_deterministic(self):
        h1 = SimilarityAnalyzer._text_hash("Hello World")
        h2 = SimilarityAnalyzer._text_hash("hello world")
        assert h1 == h2


class TestPlagiarismAnalyzer:
    async def test_high_verbatim_overlap(self):
        analyzer = PlagiarismAnalyzer()
        text = " ".join(["word"] * 100)
        ctx = AnalyzerContext(job=_mock_job(), modality="text", text_content=text)
        result = await analyzer.analyze(ctx)
        assert result.analyzer_type == AnalyzerType.PLAGIARISM

    async def test_low_overlap_no_signal(self):
        analyzer = PlagiarismAnalyzer()
        text = " ".join([f"unique_word_{i}" for i in range(50)])
        ctx = AnalyzerContext(job=_mock_job(), modality="text", text_content=text)
        result = await analyzer.analyze(ctx)
        assert len(result.signals) == 0

    async def test_short_text_no_plagiarism(self):
        analyzer = PlagiarismAnalyzer()
        ctx = AnalyzerContext(job=_mock_job(), modality="text", text_content="short text")
        result = await analyzer.analyze(ctx)
        assert result.scores.get("plagiarism_score", 0) == 0.0

    def test_verbatim_overlap_score(self):
        text = " ".join(["repeated"] * 100)
        score = PlagiarismAnalyzer._verbatim_overlap_score(text)
        assert score > 0.8

    def test_verbatim_overlap_score_unique(self):
        text = " ".join([f"word_{i}" for i in range(100)])
        score = PlagiarismAnalyzer._verbatim_overlap_score(text)
        assert score < 0.1

    def test_verbatim_overlap_score_short_text(self):
        score = PlagiarismAnalyzer._verbatim_overlap_score("short")
        assert score == 0.0

    def test_non_text_modality_skipped(self):
        analyzer = PlagiarismAnalyzer()
        assert not analyzer.can_handle("image")
        assert not analyzer.can_handle("audio")


class TestAuthenticityAnalyzer:
    async def test_image_authenticity(self):
        analyzer = AuthenticityAnalyzer()
        with tempfile.NamedTemporaryFile(suffix=".jpg") as f:
            from PIL import Image

            img = Image.new("RGB", (100, 100), color=(128, 128, 128))
            img.save(f.name, format="JPEG")
            f.flush()
            ctx = AnalyzerContext(job=_mock_job(modality="image"), modality="image", storage_path=f.name)
            result = await analyzer.analyze(ctx)
            assert result.analyzer_type == AnalyzerType.AUTHENTICITY
            assert "authenticity_score" in result.scores

    async def test_audio_authenticity_wav(self):
        analyzer = AuthenticityAnalyzer()
        with tempfile.NamedTemporaryFile(suffix=".wav") as f:
            sample_rate = 44100
            channels = 1
            bits_per_sample = 16
            data_size = 1000
            header = struct.pack(
                "<4sI4s4sIHHIIHH4sI",
                b"RIFF",
                36 + data_size,
                b"WAVE",
                b"fmt ",
                16,
                1,
                channels,
                sample_rate,
                sample_rate * channels * (bits_per_sample // 8),
                channels * (bits_per_sample // 8),
                bits_per_sample,
                b"data",
                data_size,
            )
            f.write(header + b"\x00" * data_size)
            f.flush()
            ctx = AnalyzerContext(job=_mock_job(modality="audio"), modality="audio", storage_path=f.name)
            result = await analyzer.analyze(ctx)
            assert result.analyzer_type == AnalyzerType.AUTHENTICITY
            assert "authenticity_score" in result.scores

    async def test_audio_authenticity_non_wav(self):
        analyzer = AuthenticityAnalyzer()
        with tempfile.NamedTemporaryFile(suffix=".raw") as f:
            f.write(b"\xff\xfe\xfd\xfc" * 100)
            f.flush()
            ctx = AnalyzerContext(job=_mock_job(modality="audio"), modality="audio", storage_path=f.name)
            result = await analyzer.analyze(ctx)
            assert result.analyzer_type == AnalyzerType.AUTHENTICITY
            assert any(s.signal_type == SignalType.METADATA_ANOMALY for s in result.signals)

    async def test_unsupported_modality_skipped(self):
        analyzer = AuthenticityAnalyzer()
        ctx = AnalyzerContext(job=_mock_job(modality="text"), modality="text")
        result = await analyzer.analyze(ctx)
        assert result.metadata.get("skipped") is True

    def test_elbp_inconsistency(self):
        import numpy as np

        arr = np.random.rand(100, 100) * 255
        score = AuthenticityAnalyzer._elbp_inconsistency(arr)
        assert 0.0 <= score <= 1.0

    def test_elbp_inconsistency_uniform(self):
        import numpy as np

        arr = np.ones((100, 100)) * 128
        score = AuthenticityAnalyzer._elbp_inconsistency(arr)
        assert score < 0.1

    def test_double_jpeg_score(self):
        import numpy as np

        arr = np.random.rand(100, 100) * 255
        score = AuthenticityAnalyzer._double_jpeg_score(arr)
        assert 0.0 <= score <= 1.0


class TestLanguageAnalyzer:
    async def test_english_detection(self):
        analyzer = LanguageAnalyzer()
        text = "The quick brown fox jumps over the lazy dog in the field"
        ctx = AnalyzerContext(job=_mock_job(), modality="text", text_content=text, language="en")
        result = await analyzer.analyze(ctx)
        assert result.analyzer_type == AnalyzerType.LANGUAGE
        assert result.metadata.get("detected_language") == "en"

    async def test_language_mismatch_signal(self):
        analyzer = LanguageAnalyzer()
        text = "The quick brown fox jumps over the lazy dog in the field"
        ctx = AnalyzerContext(job=_mock_job(), modality="text", text_content=text, language="hi")
        result = await analyzer.analyze(ctx)
        assert any(s.signal_type == SignalType.LANGUAGE for s in result.signals)

    async def test_no_match_empty_text(self):
        analyzer = LanguageAnalyzer()
        ctx = AnalyzerContext(job=_mock_job(), modality="text", text_content="", language="en")
        result = await analyzer.analyze(ctx)
        assert result.metadata.get("detected_language") == "unknown"

    def test_detect_language_english(self):
        lang, conf = LanguageAnalyzer._detect_language(
            "the and is in to of a that it for was with as are be this have from not but they which one you all were her has"
        )
        assert lang == "en"
        assert conf > 0.3

    def test_detect_language_short(self):
        lang, conf = LanguageAnalyzer._detect_language("hi")
        assert lang == "unknown"
        assert conf == 0.0


class TestMetadataAnalyzer:
    async def test_text_metadata(self):
        analyzer = MetadataAnalyzer()
        ctx = AnalyzerContext(
            job=_mock_job(),
            modality="text",
            text_content="Hello world, this is a test document with multiple words.",
        )
        result = await analyzer.analyze(ctx)
        assert result.analyzer_type == AnalyzerType.METADATA
        assert result.metadata.get("text_length", 0) > 0
        assert result.metadata.get("word_count", 0) > 0

    async def test_image_metadata(self):
        analyzer = MetadataAnalyzer()
        with tempfile.NamedTemporaryFile(suffix=".png") as f:
            from PIL import Image

            img = Image.new("RGB", (200, 100), color=(128, 128, 128))
            img.save(f.name, format="PNG")
            f.flush()
            ctx = AnalyzerContext(job=_mock_job(modality="image"), modality="image", storage_path=f.name)
            result = await analyzer.analyze(ctx)
            assert "dimensions" in result.metadata
            assert result.metadata["dimensions"] == "200x100"

    async def test_audio_metadata(self):
        analyzer = MetadataAnalyzer()
        with tempfile.NamedTemporaryFile(suffix=".wav") as f:
            sample_rate = 44100
            channels = 2
            bits_per_sample = 16
            data_size = 1000
            header = struct.pack(
                "<4sI4s4sIHHIIHH4sI",
                b"RIFF",
                36 + data_size,
                b"WAVE",
                b"fmt ",
                16,
                1,
                channels,
                sample_rate,
                sample_rate * channels * (bits_per_sample // 8),
                channels * (bits_per_sample // 8),
                bits_per_sample,
                b"data",
                data_size,
            )
            f.write(header + b"\x00" * data_size)
            f.flush()
            ctx = AnalyzerContext(job=_mock_job(modality="audio"), modality="audio", storage_path=f.name)
            result = await analyzer.analyze(ctx)
            assert result.metadata.get("sample_rate") == 44100
            assert result.metadata.get("channels") == 2


class TestExplainabilityEngine:
    def test_empty_signals(self):
        engine = ExplainabilityEngine()
        result = engine.generate([], {}, "text")
        assert "no significant" in result["narrative"].lower()
        assert result["key_factors"] == []

    def test_high_severity_signals(self):
        engine = ExplainabilityEngine()
        signals = [
            AnalysisSignalData(
                signal_type=SignalType.AI_CONTENT,
                severity=SignalSeverity.HIGH,
                confidence=0.9,
                title="High AI probability",
            ),
            AnalysisSignalData(
                signal_type=SignalType.PLAGIARISM,
                severity=SignalSeverity.MEDIUM,
                confidence=0.7,
                title="Moderate overlap",
            ),
        ]
        result = engine.generate(signals, {"ai_content_score": 0.9}, "text")
        assert "high-severity" in result["narrative"].lower()

    def test_recommendations_for_plagiarism(self):
        engine = ExplainabilityEngine()
        signals = [
            AnalysisSignalData(
                signal_type=SignalType.PLAGIARISM,
                severity=SignalSeverity.HIGH,
                confidence=0.9,
                title="Overlap detected",
            ),
        ]
        result = engine.generate(signals, {}, "text")
        assert any("review" in r.lower() for r in result["recommendations"])

    def test_recommendations_for_ai_content(self):
        engine = ExplainabilityEngine()
        signals = [
            AnalysisSignalData(
                signal_type=SignalType.AI_CONTENT,
                severity=SignalSeverity.HIGH,
                confidence=0.9,
                title="AI detected",
            ),
        ]
        result = engine.generate(signals, {}, "text")
        assert any("cross-referenc" in r.lower() for r in result["recommendations"])

    def test_key_factors_sorted_by_confidence(self):
        engine = ExplainabilityEngine()
        signals = [
            AnalysisSignalData(
                signal_type=SignalType.AI_CONTENT,
                severity=SignalSeverity.LOW,
                confidence=0.3,
                title="Low signal",
            ),
            AnalysisSignalData(
                signal_type=SignalType.PLAGIARISM,
                severity=SignalSeverity.HIGH,
                confidence=0.95,
                title="High signal",
            ),
        ]
        result = engine.generate(signals, {}, "text")
        assert result["key_factors"][0]["title"] == "High signal"


class TestAnalysisOrchestrator:
    def test_register_and_get_analyzer(self):
        orch = AnalysisOrchestrator()
        analyzer = AIContentAnalyzer()
        orch.register_analyzer(analyzer)
        assert orch.get_analyzer(AnalyzerType.AI_CONTENT) is analyzer

    def test_available_analyzers(self):
        orch = AnalysisOrchestrator()
        orch.register_analyzer(AIContentAnalyzer())
        orch.register_analyzer(SimilarityAnalyzer())
        assert AnalyzerType.AI_CONTENT in orch.available_analyzers()
        assert AnalyzerType.SIMILARITY in orch.available_analyzers()

    def test_select_analyzers_text_modality(self):
        orch = AnalysisOrchestrator()
        orch.register_analyzer(AIContentAnalyzer())
        orch.register_analyzer(SimilarityAnalyzer())
        orch.register_analyzer(PlagiarismAnalyzer())
        orch.register_analyzer(LanguageAnalyzer())
        orch.register_analyzer(MetadataAnalyzer())
        selected = orch.select_analyzers("text")
        assert len(selected) >= 4

    def test_select_analyzers_with_filter(self):
        orch = AnalysisOrchestrator()
        orch.register_analyzer(AIContentAnalyzer())
        orch.register_analyzer(SimilarityAnalyzer())
        selected = orch.select_analyzers("text", requested=[AnalyzerType.AI_CONTENT])
        assert len(selected) == 1
        assert selected[0].analyzer_type == AnalyzerType.AI_CONTENT

    def test_select_analyzers_image_modality(self):
        orch = AnalysisOrchestrator()
        orch.register_analyzer(AIContentAnalyzer())
        orch.register_analyzer(AuthenticityAnalyzer())
        orch.register_analyzer(MetadataAnalyzer())
        selected = orch.select_analyzers("image")
        types = [a.analyzer_type for a in selected]
        assert AnalyzerType.AI_CONTENT in types
        assert AnalyzerType.AUTHENTICITY in types
        assert AnalyzerType.METADATA in types

    def test_select_analyzers_audio_modality(self):
        orch = AnalysisOrchestrator()
        orch.register_analyzer(AIContentAnalyzer())
        orch.register_analyzer(AuthenticityAnalyzer())
        orch.register_analyzer(MetadataAnalyzer())
        selected = orch.select_analyzers("audio")
        types = [a.analyzer_type for a in selected]
        assert AnalyzerType.AI_CONTENT in types
        assert AnalyzerType.AUTHENTICITY in types
        assert AnalyzerType.METADATA in types

    async def test_execute_text_analysis(self):
        orch = AnalysisOrchestrator()
        orch.register_analyzer(AIContentAnalyzer())
        orch.register_analyzer(LanguageAnalyzer())
        orch.register_analyzer(MetadataAnalyzer())
        ctx = AnalyzerContext(
            job=_mock_job(),
            modality="text",
            text_content="This is a test document with some content to analyze.",
            language="en",
        )
        result = await orch.execute(ctx)
        assert isinstance(result, AnalyzerAggregatedResult)
        assert result.assessment in ("likely_authentic", "uncertain", "suspicious", "likely_manipulated")
        assert 0.0 <= result.confidence <= 1.0
        assert isinstance(result.risk_level, RiskLevel)

    async def test_execute_empty_content(self):
        orch = AnalysisOrchestrator()
        orch.register_analyzer(AIContentAnalyzer())
        ctx = AnalyzerContext(job=_mock_job(), modality="text", text_content=None)
        result = await orch.execute(ctx)
        assert isinstance(result, AnalyzerAggregatedResult)

    async def test_execute_with_analyzer_error(self):
        class BrokenAnalyzer(Analyzer):
            @property
            def analyzer_type(self):
                return AnalyzerType.AI_CONTENT

            @property
            def supported_modalities(self):
                return ["text"]

            async def analyze(self, ctx):
                raise RuntimeError("Boom!")

        orch = AnalysisOrchestrator()
        orch.register_analyzer(BrokenAnalyzer())
        ctx = AnalyzerContext(job=_mock_job(), modality="text", text_content="test")
        result = await orch.execute(ctx)
        assert len(result.errors) > 0
        assert "Boom!" in result.errors[0]

    def test_compute_assessment_no_signals(self):
        orch = AnalysisOrchestrator()
        assessment = orch._compute_assessment([], {})
        assert assessment == "likely_authentic"

    def test_compute_assessment_high_signals(self):
        orch = AnalysisOrchestrator()
        signals = [
            AnalysisSignalData(
                signal_type=SignalType.AI_CONTENT,
                severity=SignalSeverity.HIGH,
                confidence=0.9,
                title="test",
            )
        ] * 3
        assessment = orch._compute_assessment(signals, {})
        assert assessment == "likely_manipulated"

    def test_compute_confidence_empty(self):
        orch = AnalysisOrchestrator()
        assert orch._compute_confidence([]) == 0.5

    def test_compute_confidence_with_signals(self):
        orch = AnalysisOrchestrator()
        signals = [
            AnalysisSignalData(
                signal_type=SignalType.AI_CONTENT,
                severity=SignalSeverity.HIGH,
                confidence=0.85,
                title="test",
            ),
        ]
        assert orch._compute_confidence(signals) == 0.85

    def test_compute_risk_level_critical(self):
        orch = AnalysisOrchestrator()
        signals = [
            AnalysisSignalData(
                signal_type=SignalType.AI_CONTENT,
                severity=SignalSeverity.HIGH,
                confidence=0.95,
                title="test",
            )
        ] * 3
        risk = orch._compute_risk_level(signals, {"ai_content_score": 0.95})
        assert risk == RiskLevel.CRITICAL

    def test_compute_risk_level_minimal(self):
        orch = AnalysisOrchestrator()
        risk = orch._compute_risk_level([], {})
        assert risk == RiskLevel.MINIMAL


class TestModelRegistryService:
    def test_register_and_get(self):
        registry = ModelRegistryService()
        provider = MockModelProvider()
        inference = MockInferenceProvider()
        registry.register("test-model", provider, inference)
        assert registry.get_provider("test-model") is inference
        assert registry.get_model_provider("test-model") is provider

    def test_unregister(self):
        registry = ModelRegistryService()
        provider = MockModelProvider()
        inference = MockInferenceProvider()
        registry.register("test-model", provider, inference)
        registry.unregister("test-model")
        assert registry.get_provider("test-model") is None

    def test_list_models(self):
        registry = ModelRegistryService()
        registry.register("m1", MockModelProvider(), MockInferenceProvider())
        registry.register("m2", MockModelProvider(), MockInferenceProvider())
        assert set(registry.list_models()) == {"m1", "m2"}

    def test_is_loaded(self):
        registry = ModelRegistryService()
        provider = MockModelProvider()
        registry.register("test-model", provider, MockInferenceProvider())
        assert not registry.is_loaded("test-model")
        provider.load(
            ModelMetadata(
                model_id="test-model",
                display_name="Test",
                version="1.0",
                modality="text",
                task="classification",
                framework=ModelFramework.SKLEARN,
                status=ModelProviderStatus.DEVELOPMENT,
            )
        )
        assert registry.is_loaded("test-model")

    def test_promote_model_valid_transition(self):
        registry = ModelRegistryService()
        meta = ModelMetadata(
            model_id="test-model",
            display_name="Test",
            version="1.0",
            modality="text",
            task="classification",
            framework=ModelFramework.SKLEARN,
            status=ModelProviderStatus.DEVELOPMENT,
        )
        registry._metadata_cache["test-model"] = meta
        result = registry.promote_model("test-model", ModelProviderStatus.CANDIDATE)
        assert result is not None
        assert result.status == ModelProviderStatus.CANDIDATE

    def test_promote_model_invalid_transition(self):
        registry = ModelRegistryService()
        meta = ModelMetadata(
            model_id="test-model",
            display_name="Test",
            version="1.0",
            modality="text",
            task="classification",
            framework=ModelFramework.SKLEARN,
            status=ModelProviderStatus.DEVELOPMENT,
        )
        registry._metadata_cache["test-model"] = meta
        result = registry.promote_model("test-model", ModelProviderStatus.PRODUCTION)
        assert result is None

    def test_promote_model_not_found(self):
        registry = ModelRegistryService()
        result = registry.promote_model("nonexistent", ModelProviderStatus.CANDIDATE)
        assert result is None

    def test_can_transition(self):
        registry = ModelRegistryService()
        meta = ModelMetadata(
            model_id="test-model",
            display_name="Test",
            version="1.0",
            modality="text",
            task="classification",
            framework=ModelFramework.SKLEARN,
            status=ModelProviderStatus.DEVELOPMENT,
        )
        registry._metadata_cache["test-model"] = meta
        assert registry.can_transition("test-model", ModelProviderStatus.CANDIDATE)
        assert not registry.can_transition("test-model", ModelProviderStatus.PRODUCTION)

    def test_get_production_models(self):
        registry = ModelRegistryService()
        registry._metadata_cache["m1"] = ModelMetadata(
            model_id="m1",
            display_name="M1",
            version="1.0",
            modality="text",
            task="clf",
            framework=ModelFramework.SKLEARN,
            status=ModelProviderStatus.PRODUCTION,
        )
        registry._metadata_cache["m2"] = ModelMetadata(
            model_id="m2",
            display_name="M2",
            version="1.0",
            modality="text",
            task="clf",
            framework=ModelFramework.SKLEARN,
            status=ModelProviderStatus.DEVELOPMENT,
        )
        prod = registry.get_production_models()
        assert len(prod) == 1
        assert prod[0].model_id == "m1"

    def test_get_models_by_modality(self):
        registry = ModelRegistryService()
        registry._metadata_cache["m1"] = ModelMetadata(
            model_id="m1",
            display_name="M1",
            version="1.0",
            modality="text",
            task="clf",
            framework=ModelFramework.SKLEARN,
            status=ModelProviderStatus.PRODUCTION,
        )
        registry._metadata_cache["m2"] = ModelMetadata(
            model_id="m2",
            display_name="M2",
            version="1.0",
            modality="image",
            task="det",
            framework=ModelFramework.PYTORCH,
            status=ModelProviderStatus.PRODUCTION,
        )
        text_models = registry.get_models_by_modality("text")
        assert len(text_models) == 1
        assert text_models[0].model_id == "m1"


class TestMockProviders:
    def test_mock_model_provider_lifecycle(self):
        provider = MockModelProvider()
        assert not provider.is_loaded()
        meta = ModelMetadata(
            model_id="test",
            display_name="Test",
            version="1.0",
            modality="text",
            task="clf",
            framework=ModelFramework.SKLEARN,
            status=ModelProviderStatus.DEVELOPMENT,
        )
        provider.load(meta)
        assert provider.is_loaded()
        assert provider.get_metadata() is meta
        provider.unload()
        assert not provider.is_loaded()
        assert provider.get_metadata() is None

    def test_mock_inference_provider(self):
        provider = MockInferenceProvider(default_score=0.8)
        inp = InferenceInput(data="test", modality="text")
        out = provider.predict(inp)
        assert out.scores["confidence"] == 0.8
        assert out.model_id == "mock-model"

    def test_mock_inference_batch(self):
        provider = MockInferenceProvider()
        inputs = [InferenceInput(data=f"test_{i}", modality="text") for i in range(3)]
        outputs = provider.predict_batch(inputs)
        assert len(outputs) == 3

    def test_mock_inference_supported_modalities(self):
        provider = MockInferenceProvider()
        assert "text" in provider.supported_modalities
        assert "image" in provider.supported_modalities


class TestModelStatusLifecycle:
    def test_full_lifecycle_development_to_production(self):
        registry = ModelRegistryService()
        meta = ModelMetadata(
            model_id="lifecycle-model",
            display_name="Lifecycle Test",
            version="1.0",
            modality="text",
            task="classification",
            framework=ModelFramework.SKLEARN,
            status=ModelProviderStatus.DEVELOPMENT,
        )
        registry._metadata_cache["lifecycle-model"] = meta

        result = registry.promote_model("lifecycle-model", ModelProviderStatus.CANDIDATE)
        assert result is not None
        assert result.status == ModelProviderStatus.CANDIDATE

        result = registry.promote_model("lifecycle-model", ModelProviderStatus.STAGING)
        assert result is not None
        assert result.status == ModelProviderStatus.STAGING

        result = registry.promote_model("lifecycle-model", ModelProviderStatus.PRODUCTION)
        assert result is not None
        assert result.status == ModelProviderStatus.PRODUCTION
        assert result.promoted_at is not None

        result = registry.promote_model("lifecycle-model", ModelProviderStatus.RETIRED)
        assert result is not None
        assert result.status == ModelProviderStatus.RETIRED
        assert result.retired_at is not None

    def test_retired_model_cannot_be_promoted(self):
        registry = ModelRegistryService()
        meta = ModelMetadata(
            model_id="retired-model",
            display_name="Retired",
            version="1.0",
            modality="text",
            task="clf",
            framework=ModelFramework.SKLEARN,
            status=ModelProviderStatus.RETIRED,
        )
        registry._metadata_cache["retired-model"] = meta
        result = registry.promote_model("retired-model", ModelProviderStatus.DEVELOPMENT)
        assert result is None

    def test_candidate_can_go_back_to_development(self):
        registry = ModelRegistryService()
        meta = ModelMetadata(
            model_id="candidate-model",
            display_name="Candidate",
            version="1.0",
            modality="text",
            task="clf",
            framework=ModelFramework.SKLEARN,
            status=ModelProviderStatus.CANDIDATE,
        )
        registry._metadata_cache["candidate-model"] = meta
        result = registry.promote_model("candidate-model", ModelProviderStatus.DEVELOPMENT)
        assert result is not None
        assert result.status == ModelProviderStatus.DEVELOPMENT
