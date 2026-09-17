"""Versioned, evidence-producing AI-generated-content detectors.

The detectors deliberately separate model probability from calibrated
confidence.  A missing model, short input, or unsupported modality produces
``INSUFFICIENT_EVIDENCE`` rather than a neutral or fabricated score.
"""

from __future__ import annotations

import abc
import hashlib
import math
import re
import statistics
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Protocol


class Assessment(StrEnum):
    LIKELY_AI = "LIKELY_AI"
    LIKELY_HUMAN = "LIKELY_HUMAN"
    UNCERTAIN = "UNCERTAIN"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"


@dataclass(frozen=True)
class DetectionInput:
    modality: str
    text: str | None = None
    raw_data: Any = None
    language: str = "en"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class DetectionSignal:
    name: str
    value: float | str
    direction: str
    description: str
    method: str


@dataclass(frozen=True)
class DetectionResult:
    assessment: Assessment
    raw_model_output: dict[str, Any]
    model_probability: float | None
    calibrated_probability: float | None
    evidence_strength: float
    signals: list[DetectionSignal]
    counter_signals: list[DetectionSignal]
    evidence: list[dict[str, Any]]
    limitations: list[str]
    model_version: str
    preprocessing_version: str


class Detector(abc.ABC):
    @property
    @abc.abstractmethod
    def modality(self) -> str:
        raise NotImplementedError

    @property
    @abc.abstractmethod
    def model_version(self) -> str:
        raise NotImplementedError

    @property
    @abc.abstractmethod
    def preprocessing_version(self) -> str:
        raise NotImplementedError

    @abc.abstractmethod
    def detect(self, item: DetectionInput) -> DetectionResult:
        raise NotImplementedError


class ProbabilityCalibrator(Protocol):
    def calibrate(self, probability: float) -> float: ...


@dataclass(frozen=True)
class PlattCalibrator:
    """Temperature-free logistic calibration fitted on held-out data."""

    slope: float = 1.0
    intercept: float = 0.0

    def calibrate(self, probability: float) -> float:
        probability = min(max(probability, 1e-6), 1 - 1e-6)
        logit = math.log(probability / (1 - probability))
        return 1.0 / (1.0 + math.exp(-(self.slope * logit + self.intercept)))


class TextClassifier(Protocol):
    def predict_probability(self, features: dict[str, float], text: str, language: str) -> float: ...


class TransformerRepresentation(Protocol):
    def score(self, text: str, language: str) -> float: ...


class TextAIEnsembleDetector(Detector):
    """CPU-safe text ensemble with optional trained classifier/representation adapters."""

    def __init__(
        self,
        *,
        classifier: TextClassifier | None = None,
        transformer: TransformerRepresentation | None = None,
        calibrator: ProbabilityCalibrator | None = None,
        model_version: str = "text-ensemble-1.0.0",
        preprocessing_version: str = "text-features-1.0.0",
        minimum_words: int = 40,
    ) -> None:
        self.classifier = classifier
        self.transformer = transformer
        self.calibrator = calibrator or PlattCalibrator()
        self._model_version = model_version
        self._preprocessing_version = preprocessing_version
        self.minimum_words = minimum_words

    @property
    def modality(self) -> str:
        return "text"

    @property
    def model_version(self) -> str:
        return self._model_version

    @property
    def preprocessing_version(self) -> str:
        return self._preprocessing_version

    def detect(self, item: DetectionInput) -> DetectionResult:
        text = (item.text or "").strip()
        features = extract_text_features(text, item.language)
        if features["word_count"] < self.minimum_words:
            return _insufficient(
                self.modality,
                self.model_version,
                self.preprocessing_version,
                "Text is too short for reliable ensemble evidence.",
            )

        signals = _text_signals(features)
        counter_signals = _text_counter_signals(features)
        component_probabilities: dict[str, float] = {
            "stylometric": _weighted_signal_probability(signals, counter_signals),
            "statistical": _statistical_probability(features),
        }
        if self.classifier is not None:
            component_probabilities["classifier"] = _bounded(
                self.classifier.predict_probability(features, text, item.language)
            )
        if self.transformer is not None:
            component_probabilities["transformer"] = _bounded(self.transformer.score(text, item.language))

        weights = {
            "stylometric": 0.35,
            "statistical": 0.25,
            "classifier": 0.25 if "classifier" in component_probabilities else 0.0,
            "transformer": 0.15 if "transformer" in component_probabilities else 0.0,
        }
        total_weight = sum(weights[name] for name in component_probabilities)
        raw_probability = (
            sum(component_probabilities[name] * weights[name] for name in component_probabilities) / total_weight
        )
        calibrated = self.calibrator.calibrate(raw_probability)
        evidence_strength = min(1.0, len(_tokens(text)) / 300.0) * min(1.0, len(component_probabilities) / 4)
        assessment = _assessment(calibrated, evidence_strength)
        limitations = [
            "AI-content detectors estimate distributional similarity, not authorship identity.",
            "Performance can vary by language, genre, editing, translation, and paraphrasing.",
        ]
        if self.classifier is None:
            limitations.append("No trained text classifier adapter is configured; handcrafted signals are a baseline.")
        if features.get("language_stylometric_only", 0) > 0:
            limitations.append(
                f"AI detection model not trained for language '{item.language}'. "
                "Using stylometric features only. Accuracy is reduced compared to languages with trained models."
            )
        elif features.get("language_known", 0) == 0:
            limitations.append(
                f"Language '{item.language}' is not recognized. "
                "Detection relies on universal stylometric features. Results may be less accurate."
            )
        return DetectionResult(
            assessment=assessment,
            raw_model_output={"component_probabilities": component_probabilities, "features": features},
            model_probability=raw_probability,
            calibrated_probability=calibrated,
            evidence_strength=evidence_strength,
            signals=signals,
            counter_signals=counter_signals,
            evidence=_evidence_from_signals(signals + counter_signals),
            limitations=limitations,
            model_version=self.model_version,
            preprocessing_version=self.preprocessing_version,
        )


class ModalityDetector(Detector):
    def __init__(
        self, modality_name: str, *, model_version: str = "unconfigured", preprocessing_version: str = "unknown"
    ):
        self._modality = modality_name
        self._model_version = model_version
        self._preprocessing_version = preprocessing_version

    @property
    def modality(self) -> str:
        return self._modality

    @property
    def model_version(self) -> str:
        return self._model_version

    @property
    def preprocessing_version(self) -> str:
        return self._preprocessing_version

    def detect(self, item: DetectionInput) -> DetectionResult:
        return _insufficient(
            self.modality,
            self.model_version,
            self.preprocessing_version,
            f"No validated {self.modality} detector model is configured.",
        )


class ImageAIDetector(ModalityDetector):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__("image", **kwargs)


class AudioAIDetector(ModalityDetector):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__("audio", **kwargs)


class VideoAIDetector(ModalityDetector):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__("video", **kwargs)


class DocumentAIDetector(TextAIEnsembleDetector):
    @property
    def modality(self) -> str:
        return "document"


@dataclass(frozen=True)
class GoldenRecord:
    sample_id: str
    modality: str
    language: str
    label: int
    text: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class GoldenEvaluationDataset:
    """Labeled benchmark manifest with duplicate-safe split assignment."""

    records: tuple[GoldenRecord, ...]
    dataset_version: str

    def split(self, *, evaluation_fraction: float = 0.2) -> tuple[list[GoldenRecord], list[GoldenRecord]]:
        if not 0 < evaluation_fraction < 1:
            raise ValueError("evaluation_fraction must be between 0 and 1")
        groups: dict[str, list[GoldenRecord]] = {}
        for record in self.records:
            group = str(record.metadata.get("source_group", record.sample_id))
            groups.setdefault(group, []).append(record)
        evaluation: list[GoldenRecord] = []
        training: list[GoldenRecord] = []
        for group, members in sorted(groups.items()):
            digest = hashlib.sha256(group.encode("utf-8")).digest()
            bucket = int.from_bytes(digest[:8], "big") / 2**64
            (evaluation if bucket < evaluation_fraction else training).extend(members)
        if not evaluation:
            moved_group = str(training[0].metadata.get("source_group", training[0].sample_id))
            moved = groups[moved_group]
            evaluation.extend(moved)
            training = [record for record in training if record not in moved]
        if not training:
            moved_group = str(evaluation[0].metadata.get("source_group", evaluation[0].sample_id))
            moved = groups[moved_group]
            training.extend(moved)
            evaluation = [record for record in evaluation if record not in moved]
        return training, evaluation

    def validate_no_leakage(self, training: list[GoldenRecord], evaluation: list[GoldenRecord]) -> None:
        training_groups = {str(record.metadata.get("source_group", record.sample_id)) for record in training}
        evaluation_groups = {str(record.metadata.get("source_group", record.sample_id)) for record in evaluation}
        overlap = training_groups & evaluation_groups
        if overlap:
            raise ValueError(f"Golden dataset leakage detected for groups: {sorted(overlap)}")


@dataclass(frozen=True)
class EvaluationMetrics:
    precision: float
    recall: float
    f1: float
    roc_auc: float | None
    pr_auc: float | None
    brier_score: float
    expected_calibration_error: float
    false_positive_rate: float
    false_negative_rate: float
    by_language: dict[str, dict[str, float]]
    by_modality: dict[str, dict[str, float]]


def evaluate_golden_dataset(detector: Detector, records: list[GoldenRecord]) -> EvaluationMetrics:
    """Evaluate only supplied, labeled records; no synthetic relevance is inferred."""
    scored = [
        (
            record,
            detector.detect(
                DetectionInput(record.modality, record.text, language=record.language, metadata=record.metadata)
            ),
        )
        for record in records
    ]
    valid = [(record, result) for record, result in scored if result.calibrated_probability is not None]
    if not valid:
        raise ValueError("Golden dataset contains no samples with sufficient detector evidence")
    labels = [record.label for record, _ in valid]
    probabilities = [result.calibrated_probability or 0.0 for _, result in valid]
    predictions = [int(probability >= 0.5) for probability in probabilities]
    tp = sum(label == 1 and prediction == 1 for label, prediction in zip(labels, predictions))
    fp = sum(label == 0 and prediction == 1 for label, prediction in zip(labels, predictions))
    fn = sum(label == 1 and prediction == 0 for label, prediction in zip(labels, predictions))
    tn = sum(label == 0 and prediction == 0 for label, prediction in zip(labels, predictions))
    precision = _ratio(tp, tp + fp)
    recall = _ratio(tp, tp + fn)
    fpr = _ratio(fp, fp + tn)
    fnr = _ratio(fn, fn + tp)
    language = _group_metrics(valid, lambda record: record.language)
    modality = _group_metrics(valid, lambda record: record.modality)
    return EvaluationMetrics(
        precision=precision,
        recall=recall,
        f1=_ratio(2 * precision * recall, precision + recall),
        roc_auc=_auc(labels, probabilities),
        pr_auc=_pr_auc(labels, probabilities),
        brier_score=sum((probability - label) ** 2 for label, probability in zip(labels, probabilities)) / len(labels),
        expected_calibration_error=_ece(labels, probabilities),
        false_positive_rate=fpr,
        false_negative_rate=fnr,
        by_language=language,
        by_modality=modality,
    )


def extract_text_features(text: str, language: str = "en") -> dict[str, float]:
    """Extract linguistic features for AI detection.

    Includes language capability tracking: languages without trained models
    rely on stylometric/statistical features only (reduced accuracy).
    """
    from app.core.language_config import AnalysisCapability, has_capability

    tokens = _tokens(text)
    sentences = [part for part in re.split(r"[.!?]+", text) if part.strip()]
    lengths = [len(_tokens(sentence)) for sentence in sentences] or [0]
    frequencies: dict[str, int] = {}
    for token in tokens:
        frequencies[token] = frequencies.get(token, 0) + 1
    punctuation = sum(1 for char in text if char in ",;:!?()[]{}-")
    repeated_bigrams = _repeated_ngram_ratio(tokens, 2)
    repeated_trigrams = _repeated_ngram_ratio(tokens, 3)

    language_known = float(has_capability(language, AnalysisCapability.AI_DETECTION))
    language_stylometric_only = float(
        has_capability(language, AnalysisCapability.STYLOMETRIC)
        and not has_capability(language, AnalysisCapability.AI_DETECTION)
    )

    return {
        "word_count": float(len(tokens)),
        "sentence_count": float(len(sentences)),
        "type_token_ratio": _ratio(len(set(tokens)), len(tokens)),
        "avg_sentence_length": statistics.fmean(lengths),
        "sentence_length_std": statistics.pstdev(lengths) if len(lengths) > 1 else 0.0,
        "burstiness": _ratio(statistics.pstdev(lengths), statistics.fmean(lengths) or 1.0),
        "punctuation_rate": _ratio(punctuation, len(text)),
        "repeated_bigram_ratio": repeated_bigrams,
        "repeated_trigram_ratio": repeated_trigrams,
        "hapax_ratio": _ratio(sum(value == 1 for value in frequencies.values()), len(tokens)),
        "formal_word_ratio": _ratio(sum(len(token) >= 9 for token in tokens), len(tokens)),
        "transition_density": _ratio(
            sum(token in _TRANSITIONS for token in tokens),
            max(len(sentences), 1),
        ),
        "language_known": language_known,
        "language_stylometric_only": language_stylometric_only,
    }


_TRANSITIONS = {
    "additionally",
    "consequently",
    "furthermore",
    "moreover",
    "nevertheless",
    "therefore",
    "thus",
    "subsequently",
}


def _text_signals(features: dict[str, float]) -> list[DetectionSignal]:
    signals: list[DetectionSignal] = []
    if features["sentence_length_std"] < 5:
        signals.append(
            DetectionSignal(
                "sentence_uniformity",
                features["sentence_length_std"],
                "supports_ai",
                "Sentence lengths show low variation.",
                "stylometry",
            )
        )
    if features["transition_density"] > 0.25:
        signals.append(
            DetectionSignal(
                "transition_density",
                features["transition_density"],
                "supports_ai",
                "Frequent discourse transitions are present.",
                "stylometry",
            )
        )
    if features["formal_word_ratio"] > 0.25:
        signals.append(
            DetectionSignal(
                "formal_word_ratio",
                features["formal_word_ratio"],
                "supports_ai",
                "A high proportion of long/formal tokens was observed.",
                "lexical",
            )
        )
    if features["repeated_bigram_ratio"] > 0.08:
        signals.append(
            DetectionSignal(
                "phrase_repetition",
                features["repeated_bigram_ratio"],
                "supports_ai",
                "Repeated local phrases were observed.",
                "statistical",
            )
        )
    return signals


def _text_counter_signals(features: dict[str, float]) -> list[DetectionSignal]:
    signals: list[DetectionSignal] = []
    if features["sentence_length_std"] > 10:
        signals.append(
            DetectionSignal(
                "sentence_burstiness",
                features["sentence_length_std"],
                "supports_human",
                "Sentence lengths vary substantially.",
                "stylometry",
            )
        )
    if features["type_token_ratio"] > 0.7:
        signals.append(
            DetectionSignal(
                "lexical_diversity",
                features["type_token_ratio"],
                "supports_human",
                "The text has high lexical diversity.",
                "lexical",
            )
        )
    if features["punctuation_rate"] > 0.04:
        signals.append(
            DetectionSignal(
                "punctuation_variation",
                features["punctuation_rate"],
                "supports_human",
                "Punctuation usage is varied.",
                "stylometry",
            )
        )
    return signals


def _weighted_signal_probability(signals: list[DetectionSignal], counter_signals: list[DetectionSignal]) -> float:
    ai = sum(_signal_strength(signal) for signal in signals)
    human = sum(_signal_strength(signal) for signal in counter_signals)
    return _bounded(0.5 + 0.5 * math.tanh(ai - human))


def _statistical_probability(features: dict[str, float]) -> float:
    score = (
        0.35 * (1 - min(features["burstiness"], 1.0))
        + 0.25 * min(features["transition_density"], 1.0)
        + 0.2 * min(features["formal_word_ratio"] / 0.35, 1.0)
        + 0.2 * features["repeated_bigram_ratio"]
    )
    return _bounded(score)


def _signal_strength(signal: DetectionSignal) -> float:
    value = signal.value if isinstance(signal.value, (float, int)) else 0.0
    return min(1.0, abs(float(value)))


def _assessment(probability: float, evidence_strength: float) -> Assessment:
    if evidence_strength < 0.2:
        return Assessment.INSUFFICIENT_EVIDENCE
    if 0.4 <= probability <= 0.6:
        return Assessment.UNCERTAIN
    return Assessment.LIKELY_AI if probability > 0.6 else Assessment.LIKELY_HUMAN


def _insufficient(modality: str, model_version: str, preprocessing_version: str, limitation: str) -> DetectionResult:
    return DetectionResult(
        assessment=Assessment.INSUFFICIENT_EVIDENCE,
        raw_model_output={"modality": modality, "available": False},
        model_probability=None,
        calibrated_probability=None,
        evidence_strength=0.0,
        signals=[],
        counter_signals=[],
        evidence=[],
        limitations=[limitation],
        model_version=model_version,
        preprocessing_version=preprocessing_version,
    )


def _evidence_from_signals(signals: list[DetectionSignal]) -> list[dict[str, Any]]:
    return [
        {
            "name": signal.name,
            "value": signal.value,
            "direction": signal.direction,
            "method": signal.method,
            "description": signal.description,
        }
        for signal in signals
    ]


def _tokens(text: str) -> list[str]:
    return re.findall(r"\b[\w'-]+\b", text.lower(), flags=re.UNICODE)


def _repeated_ngram_ratio(tokens: list[str], size: int) -> float:
    if len(tokens) < size:
        return 0.0
    ngrams = [tuple(tokens[index : index + size]) for index in range(len(tokens) - size + 1)]
    return _ratio(len(ngrams) - len(set(ngrams)), len(ngrams))


def _ratio(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


def _bounded(value: float) -> float:
    return min(max(float(value), 0.0), 1.0)


def _auc(labels: list[int], probabilities: list[float]) -> float | None:
    positives = sum(labels)
    negatives = len(labels) - positives
    if not positives or not negatives:
        return None
    ranked = sorted(zip(probabilities, labels), key=lambda pair: pair[0])
    rank_sum = sum(index for index, (_, label) in enumerate(ranked, start=1) if label == 1)
    return _ratio(rank_sum - positives * (positives + 1) / 2, positives * negatives)


def _pr_auc(labels: list[int], probabilities: list[float]) -> float | None:
    if not any(labels):
        return None
    order = sorted(range(len(labels)), key=lambda index: probabilities[index], reverse=True)
    positives = sum(labels)
    true_positives = 0
    previous_recall = 0.0
    area = 0.0
    for rank, index in enumerate(order, start=1):
        true_positives += labels[index]
        recall = true_positives / positives
        precision = true_positives / rank
        area += (recall - previous_recall) * precision
        previous_recall = recall
    return area


def _ece(labels: list[int], probabilities: list[float], bins: int = 10) -> float:
    error = 0.0
    for bucket in range(bins):
        lower = bucket / bins
        upper = (bucket + 1) / bins
        members = [
            (label, probability)
            for label, probability in zip(labels, probabilities)
            if lower <= probability < upper or (bucket == bins - 1 and probability == upper)
        ]
        if members:
            error += (
                len(members)
                / len(labels)
                * abs(
                    statistics.fmean(label for label, _ in members)
                    - statistics.fmean(probability for _, probability in members)
                )
            )
    return error


def _group_metrics(
    scored: list[tuple[GoldenRecord, DetectionResult]],
    key_fn: Any,
) -> dict[str, dict[str, float]]:
    groups: dict[str, list[tuple[GoldenRecord, DetectionResult]]] = {}
    for record, result in scored:
        groups.setdefault(key_fn(record), []).append((record, result))
    metrics: dict[str, dict[str, float]] = {}
    for key, members in groups.items():
        labels = [record.label for record, _ in members]
        probabilities = [result.calibrated_probability or 0.0 for _, result in members]
        predictions = [int(probability >= 0.5) for probability in probabilities]
        tp = sum(label == 1 and prediction == 1 for label, prediction in zip(labels, predictions))
        fp = sum(label == 0 and prediction == 1 for label, prediction in zip(labels, predictions))
        fn = sum(label == 1 and prediction == 0 for label, prediction in zip(labels, predictions))
        precision = _ratio(tp, tp + fp)
        recall = _ratio(tp, tp + fn)
        metrics[key] = {
            "precision": precision,
            "recall": recall,
            "f1": _ratio(2 * precision * recall, precision + recall),
            "sample_count": float(len(members)),
        }
    return metrics
