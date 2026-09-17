from app.services.evaluation_framework import (
    NOT_EVALUATED,
    ModelEvaluationRecord,
    RetrievalPrediction,
    build_evaluation_catalog,
    evaluate_ai_detection_metrics,
    evaluate_explainability,
    evaluate_generation,
    evaluate_plagiarism,
    evaluate_retrieval,
    require_evaluation_record,
    split_dataset_for_evaluation,
)


def test_evaluation_catalog_reports_not_evaluated_for_unregistered_benchmarks() -> None:
    catalog = build_evaluation_catalog()
    assert set(catalog) == {
        "ai_detection",
        "plagiarism",
        "similarity",
        "authenticity",
        "rag_retrieval",
        "llm_reasoning",
        "multilingual_analysis",
        "explainability",
    }
    assert catalog["rag_retrieval"].status == NOT_EVALUATED
    assert catalog["llm_reasoning"].status == NOT_EVALUATED


def test_retrieval_eval_is_separate_from_generation_eval() -> None:
    retrieval = evaluate_retrieval(
        predictions=[
            RetrievalPrediction(doc_id="d1", relevant=True, attributed=True, rank=1, context_relevance=0.8, score=0.9),
            RetrievalPrediction(doc_id="d2", relevant=False, attributed=True, rank=2, context_relevance=0.4, score=0.2),
            RetrievalPrediction(doc_id="d3", relevant=True, attributed=False, rank=3, context_relevance=0.7, score=0.7),
        ],
        relevant_doc_ids={"d1", "d3"},
        attributed_doc_ids={"d1", "d2"},
    )

    assert retrieval.status == "OK"
    assert retrieval.precision == 2 / 3
    assert retrieval.recall == 1.0
    assert retrieval.source_attribution_accuracy == 2 / 3

    generation = evaluate_generation(predictions=[{"groundedness": 0.8, "answer_fidelity": 0.9, "source_usage": 0.7}])
    assert generation.status == "OK"
    assert generation.groundedness == 0.8


def test_split_dataset_for_evaluation_rejects_source_group_overlap() -> None:
    records = [
        {"sample_id": "a1", "source_group": "group-1", "label": 1},
        {"sample_id": "a2", "source_group": "group-1", "label": 0},
        {"sample_id": "b1", "source_group": "group-2", "label": 1},
        {"sample_id": "b2", "source_group": "group-2", "label": 0},
        {"sample_id": "c1", "source_group": "group-3", "label": 0},
    ]

    train, eval_set = split_dataset_for_evaluation(records, evaluation_fraction=0.4)
    assert bool(train)
    assert bool(eval_set)

    dataset = build_evaluation_catalog()["ai_detection"]
    dataset.validate_no_leakage(train, eval_set)

    overlapping_train = [{"sample_id": "overlap", "source_group": "group-1", "label": 1}]
    overlapping_eval = [{"sample_id": "overlap-copy", "source_group": "group-1", "label": 0}]
    try:
        dataset.validate_no_leakage(overlapping_train, overlapping_eval)
    except ValueError:
        pass
    else:
        raise AssertionError("Leakage check should fail when groups overlap")


def test_ai_detection_metrics_and_plagiarism_metrics_evaluate_without_fake_results() -> None:
    ai = evaluate_ai_detection_metrics(labels=[1, 0, 1], probabilities=[0.9, 0.2, 0.7])
    assert ai["status"] == "OK"
    assert ai["precision"] == 1.0
    assert ai["false_positive_rate"] == 0.0

    plagiarism = evaluate_plagiarism(exact_matches=9, near_duplicates=7, total=10)
    assert plagiarism["status"] == "OK"
    assert plagiarism["exact_match_accuracy"] == 0.9
    assert plagiarism["near_duplicate_accuracy"] == 0.7

    missing = evaluate_ai_detection_metrics(labels=None, probabilities=None)
    assert missing["status"] == NOT_EVALUATED


def test_evaluation_record_is_required_for_model_deployments() -> None:
    records = [
        ModelEvaluationRecord(
            model_name="detector-v2",
            model_version="v2.0.0",
            dataset_name="AI detection golden set",
            dataset_version="golden-v0",
            task="ai_detection",
            metrics={"precision": 0.91},
        )
    ]

    result = require_evaluation_record(
        model_name="detector-v2",
        model_version="v2.0.0",
        dataset_name="AI detection golden set",
        dataset_version="golden-v0",
        task="ai_detection",
        records=records,
    )
    assert result.model_version == "v2.0.0"

    try:
        require_evaluation_record(
            model_name="detector-v3",
            model_version="v3.0.0",
            dataset_name="AI detection golden set",
            dataset_version="golden-v0",
            task="ai_detection",
            records=records,
        )
    except ValueError:
        pass
    else:
        raise AssertionError("A production model change without an evaluation record should fail")


def test_explainability_metrics_require_ground_truth() -> None:
    result = evaluate_explainability(attribution_available=[True, False], localization_valid=[True, False])
    assert result["status"] == "OK"
    assert result["attribution_availability"] == 0.5
    assert result["localization_validity"] == 0.5

    missing = evaluate_explainability(attribution_available=None, localization_valid=None)
    assert missing["status"] == NOT_EVALUATED
