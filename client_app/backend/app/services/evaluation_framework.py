"""Evaluation framework for AI quality, retrieval quality, and governance.

This module intentionally separates retrieval evaluation from generation evaluation.
If a dataset is not available or not yet fixed, the framework returns
``NOT_EVALUATED`` rather than fabricating metrics.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

NOT_EVALUATED = "NOT_EVALUATED"


@dataclass(frozen=True)
class EvaluationDataset:
    """A benchmark descriptor for a task domain.

    Records may be empty when no benchmark has been approved. In that case the
    metrics must stay ``NOT_EVALUATED``.
    """

    task: str
    dataset_name: str
    dataset_version: str
    records: tuple[dict[str, Any], ...] = ()
    source_group_field: str = "source_group"
    notes: str = ""
    status: str = "READY"

    def validate_no_leakage(self, train: Iterable[dict[str, Any]], eval_set: Iterable[dict[str, Any]]) -> None:
        train_groups = {str(item.get(self.source_group_field, item.get("sample_id", "unknown"))) for item in train}
        eval_groups = {str(item.get(self.source_group_field, item.get("sample_id", "unknown"))) for item in eval_set}
        overlap = sorted(train_groups & eval_groups)
        if overlap:
            raise ValueError(f"Dataset leakage detected for task '{self.task}' with groups: {overlap}")


def build_evaluation_catalog() -> dict[str, EvaluationDataset]:
    """Return benchmark descriptors for the supported evaluation areas.

    The repository does not contain approved public datasets for all tasks. For
    those tasks, the catalog intentionally reports ``NOT_EVALUATED`` instead of
    fabricated scores.
    """

    return {
        "ai_detection": EvaluationDataset(
            task="ai_detection",
            dataset_name="AI detection golden set",
            dataset_version="golden-v0",
            records=(),
            notes="No approved benchmark is currently registered for this task in the repository.",
            status=NOT_EVALUATED,
        ),
        "plagiarism": EvaluationDataset(
            task="plagiarism",
            dataset_name="Plagiarism benchmark",
            dataset_version="golden-v0",
            records=(),
            notes="No approved plagiarism benchmark is currently registered for this task in the repository.",
            status=NOT_EVALUATED,
        ),
        "similarity": EvaluationDataset(
            task="similarity",
            dataset_name="Similarity benchmark",
            dataset_version="golden-v0",
            records=(),
            notes="No approved similarity benchmark is currently registered for this task in the repository.",
            status=NOT_EVALUATED,
        ),
        "authenticity": EvaluationDataset(
            task="authenticity",
            dataset_name="Authenticity benchmark",
            dataset_version="golden-v0",
            records=(),
            notes="No approved authenticity benchmark is currently registered for this task in the repository.",
            status=NOT_EVALUATED,
        ),
        "rag_retrieval": EvaluationDataset(
            task="rag_retrieval",
            dataset_name="RAG retrieval benchmark",
            dataset_version="golden-v0",
            records=(),
            notes="No approved RAG retrieval benchmark is currently registered for this task in the repository.",
            status=NOT_EVALUATED,
        ),
        "llm_reasoning": EvaluationDataset(
            task="llm_reasoning",
            dataset_name="LLM reasoning benchmark",
            dataset_version="golden-v0",
            records=(),
            notes="No approved LLM reasoning benchmark is currently registered for this task in the repository.",
            status=NOT_EVALUATED,
        ),
        "multilingual_analysis": EvaluationDataset(
            task="multilingual_analysis",
            dataset_name="Multilingual benchmark",
            dataset_version="golden-v0",
            records=(),
            notes="No approved multilingual benchmark is currently registered for this task in the repository.",
            status=NOT_EVALUATED,
        ),
        "explainability": EvaluationDataset(
            task="explainability",
            dataset_name="Explainability benchmark",
            dataset_version="golden-v0",
            records=(),
            notes="No approved explainability benchmark is currently registered for this task in the repository.",
            status=NOT_EVALUATED,
        ),
    }


@dataclass(frozen=True)
class RetrievalPrediction:
    doc_id: str
    relevant: bool = False
    attributed: bool = True
    rank: int = 0
    context_relevance: float = 0.0
    score: float = 0.0


@dataclass(frozen=True)
class RetrievalEvaluationResult:
    precision: float | str
    recall: float | str
    ranking_quality: float | str
    source_attribution_accuracy: float | str
    context_relevance: float | str
    status: str


def evaluate_retrieval(
    *,
    predictions: list[RetrievalPrediction] | None = None,
    relevant_doc_ids: set[str] | None = None,
    attributed_doc_ids: set[str] | None = None,
) -> RetrievalEvaluationResult:
    """Evaluate retrieval independently from generation.

    If no real benchmark is passed in, the result is explicitly marked as
    ``NOT_EVALUATED``.
    """

    if not predictions or relevant_doc_ids is None:
        return RetrievalEvaluationResult(
            precision=NOT_EVALUATED,
            recall=NOT_EVALUATED,
            ranking_quality=NOT_EVALUATED,
            source_attribution_accuracy=NOT_EVALUATED,
            context_relevance=NOT_EVALUATED,
            status=NOT_EVALUATED,
        )

    retrieved = [prediction for prediction in predictions if prediction.rank > 0]
    relevant_retrieved = [prediction for prediction in retrieved if prediction.doc_id in relevant_doc_ids]
    total_relevant = max(len(relevant_doc_ids), 1)
    precision = len(relevant_retrieved) / max(len(retrieved), 1)
    recall = len(relevant_retrieved) / total_relevant

    rr = 0.0
    dcg = 0.0
    idcg = 0.0
    for prediction in retrieved:
        if prediction.doc_id in relevant_doc_ids:
            rr = max(rr, 1.0 / prediction.rank)
            dcg += (2**1 - 1) / (prediction.rank + 1)
        idcg += (2**1 - 1) / (prediction.rank + 1)
    ndcg = dcg / max(idcg, 1e-9)
    ranking_quality = ndcg if rr else 0.0

    attributed_doc_ids = attributed_doc_ids or {prediction.doc_id for prediction in retrieved if prediction.attributed}
    correct_attribution = sum(
        1 for prediction in retrieved if prediction.doc_id in attributed_doc_ids and prediction.attributed
    )
    source_attribution_accuracy = correct_attribution / max(len(retrieved), 1)
    context_relevance = sum(prediction.context_relevance for prediction in retrieved) / max(len(retrieved), 1)

    return RetrievalEvaluationResult(
        precision=precision,
        recall=recall,
        ranking_quality=ranking_quality,
        source_attribution_accuracy=source_attribution_accuracy,
        context_relevance=context_relevance,
        status="OK",
    )


@dataclass(frozen=True)
class GenerationEvaluationResult:
    groundedness: float | str
    answer_fidelity: float | str
    source_usage: float | str
    status: str


def evaluate_generation(*, predictions: list[dict[str, Any]] | None = None) -> GenerationEvaluationResult:
    """Evaluate generation separately from retrieval.

    This intentionally does not fabricate metrics when no fixed evaluation set is
    present.
    """

    if not predictions:
        return GenerationEvaluationResult(
            groundedness=NOT_EVALUATED,
            answer_fidelity=NOT_EVALUATED,
            source_usage=NOT_EVALUATED,
            status=NOT_EVALUATED,
        )

    groundedness = sum(float(item.get("groundedness", 0.0)) for item in predictions) / max(len(predictions), 1)
    answer_fidelity = sum(float(item.get("answer_fidelity", 0.0)) for item in predictions) / max(len(predictions), 1)
    source_usage = sum(float(item.get("source_usage", 0.0)) for item in predictions) / max(len(predictions), 1)
    return GenerationEvaluationResult(
        groundedness=groundedness,
        answer_fidelity=answer_fidelity,
        source_usage=source_usage,
        status="OK",
    )


@dataclass(frozen=True)
class ModelEvaluationRecord:
    model_name: str
    model_version: str
    dataset_name: str
    dataset_version: str
    task: str
    metrics: dict[str, Any]
    created_at: str = ""


def require_evaluation_record(
    *,
    model_name: str,
    model_version: str,
    dataset_name: str,
    dataset_version: str,
    task: str,
    records: list[ModelEvaluationRecord],
) -> ModelEvaluationRecord:
    """Require a fixed golden-set evaluation record for any new model or change."""

    for record in records:
        matches = (
            record.model_name == model_name
            and record.model_version == model_version
            and record.dataset_name == dataset_name
            and record.dataset_version == dataset_version
            and record.task == task
        )
        if matches:
            return record
    raise ValueError(
        f"Production change for model '{model_name}' requires a fixed golden evaluation record for task '{task}' on dataset '{dataset_name}@{dataset_version}'."
    )


def split_dataset_for_evaluation(
    records: list[dict[str, Any]], *, evaluation_fraction: float = 0.2
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Split a benchmark using source groups to preserve leakage safety."""

    if not 0 < evaluation_fraction < 1:
        raise ValueError("evaluation_fraction must be between 0 and 1")

    groups: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        group = str(record.get("source_group", record.get("sample_id", "unknown")))
        groups.setdefault(group, []).append(record)

    train: list[dict[str, Any]] = []
    eval_set: list[dict[str, Any]] = []
    for group, members in sorted(groups.items()):
        digest = hashlib.sha256(group.encode("utf-8")).digest()
        bucket = int.from_bytes(digest[:8], "big") / float(2**64)
        (eval_set if bucket < evaluation_fraction else train).extend(members)

    if not train or not eval_set:
        raise ValueError("Dataset split did not produce both training and evaluation partitions")

    return train, eval_set


def evaluate_ai_detection_metrics(
    *,
    labels: list[int] | None = None,
    probabilities: list[float] | None = None,
) -> dict[str, float | str]:
    """Evaluate AI detection with no fabricated numbers when the labels are absent."""

    if labels is None or probabilities is None or not labels or len(labels) != len(probabilities):
        return {
            "precision": NOT_EVALUATED,
            "recall": NOT_EVALUATED,
            "f1": NOT_EVALUATED,
            "roc_auc": NOT_EVALUATED,
            "pr_auc": NOT_EVALUATED,
            "calibration": NOT_EVALUATED,
            "false_positive_rate": NOT_EVALUATED,
            "false_negative_rate": NOT_EVALUATED,
            "status": NOT_EVALUATED,
        }

    predictions = [1 if prob >= 0.5 else 0 for prob in probabilities]
    tp = sum(1 for label, pred in zip(labels, predictions) if label == 1 and pred == 1)
    fp = sum(1 for label, pred in zip(labels, predictions) if label == 0 and pred == 1)
    fn = sum(1 for label, pred in zip(labels, predictions) if label == 1 and pred == 0)
    tn = sum(1 for label, pred in zip(labels, predictions) if label == 0 and pred == 0)

    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    f1 = 2 * precision * recall / max(precision + recall, 1e-9)
    fpr = fp / max(fp + tn, 1)
    fnr = fn / max(fn + tp, 1)
    calibration = sum(abs(prob - label) for label, prob in zip(labels, probabilities)) / max(len(labels), 1)

    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "roc_auc": NOT_EVALUATED,
        "pr_auc": NOT_EVALUATED,
        "calibration": calibration,
        "false_positive_rate": fpr,
        "false_negative_rate": fnr,
        "status": "OK",
    }


def evaluate_plagiarism(
    *, exact_matches: int | None = None, near_duplicates: int | None = None, total: int | None = None
) -> dict[str, float | str]:
    if exact_matches is None or near_duplicates is None or total is None:
        return {
            "exact_match_accuracy": NOT_EVALUATED,
            "near_duplicate_accuracy": NOT_EVALUATED,
            "paraphrase_retrieval": NOT_EVALUATED,
            "source_retrieval": NOT_EVALUATED,
            "false_positive_rate": NOT_EVALUATED,
            "status": NOT_EVALUATED,
        }
    exact_match_accuracy = exact_matches / max(total, 1)
    near_duplicate_accuracy = near_duplicates / max(total, 1)
    return {
        "exact_match_accuracy": exact_match_accuracy,
        "near_duplicate_accuracy": near_duplicate_accuracy,
        "paraphrase_retrieval": NOT_EVALUATED,
        "source_retrieval": NOT_EVALUATED,
        "false_positive_rate": NOT_EVALUATED,
        "status": "OK",
    }


def evaluate_explainability(
    *, attribution_available: list[bool] | None = None, localization_valid: list[bool] | None = None
) -> dict[str, float | str]:
    if attribution_available is None or localization_valid is None:
        return {
            "attribution_availability": NOT_EVALUATED,
            "localization_validity": NOT_EVALUATED,
            "consistency": NOT_EVALUATED,
            "modality_coverage": NOT_EVALUATED,
            "status": NOT_EVALUATED,
        }
    attribution_availability = sum(1 for value in attribution_available if value) / max(len(attribution_available), 1)
    localization_validity = sum(1 for value in localization_valid if value) / max(len(localization_valid), 1)
    return {
        "attribution_availability": attribution_availability,
        "localization_validity": localization_validity,
        "consistency": NOT_EVALUATED,
        "modality_coverage": NOT_EVALUATED,
        "status": "OK",
    }
