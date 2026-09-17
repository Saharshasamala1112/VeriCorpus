import pytest

from app.services.ai_content_detection import (
    Assessment,
    DetectionInput,
    DocumentAIDetector,
    GoldenEvaluationDataset,
    GoldenRecord,
    ImageAIDetector,
    TextAIEnsembleDetector,
    evaluate_golden_dataset,
    extract_text_features,
)


def test_text_features_include_ensemble_families():
    features = extract_text_features(
        "This is a sufficiently long sentence for feature extraction. "
        "Furthermore the analysis includes additional formal terminology and repeated structure. "
        "The final sentence provides enough material for statistical evaluation.",
        "en",
    )
    assert features["word_count"] > 20
    assert "sentence_length_std" in features
    assert "transition_density" in features
    assert "type_token_ratio" in features


def test_short_text_is_insufficient_not_neutral():
    result = TextAIEnsembleDetector().detect(DetectionInput(modality="text", text="hello"))
    assert result.assessment == Assessment.INSUFFICIENT_EVIDENCE
    assert result.model_probability is None
    assert result.calibrated_probability is None


def test_text_detector_returns_distinct_raw_and_calibrated_outputs():
    text = (
        "Furthermore, the systematic methodology demonstrates comprehensive analysis of the "
        "underlying computational framework. Additionally, the results provide significant "
        "insights into the mechanisms supporting the proposed evaluation."
    )
    result = TextAIEnsembleDetector(minimum_words=20).detect(DetectionInput(modality="text", text=text, language="en"))
    assert result.model_probability is not None
    assert result.calibrated_probability is not None
    assert result.raw_model_output["component_probabilities"]
    assert result.limitations


def test_unconfigured_modalities_are_explicitly_insufficient():
    result = ImageAIDetector().detect(DetectionInput(modality="image", raw_data="asset.png"))
    assert result.assessment == Assessment.INSUFFICIENT_EVIDENCE
    assert result.model_probability is None
    assert result.evidence_strength == 0.0


def test_golden_dataset_split_prevents_source_group_leakage():
    records = tuple(
        GoldenRecord(
            sample_id=f"sample-{index}",
            modality="text",
            language="en",
            label=index % 2,
            text="A labeled evaluation sample with sufficient content for testing.",
            metadata={"source_group": f"group-{index}"},
        )
        for index in range(20)
    )
    dataset = GoldenEvaluationDataset(records, "golden-v1")
    training, evaluation = dataset.split(evaluation_fraction=0.3)
    dataset.validate_no_leakage(training, evaluation)
    assert training
    assert evaluation


def test_evaluation_reports_required_metrics():
    detector = TextAIEnsembleDetector(minimum_words=5)
    records = [
        GoldenRecord(
            "ai",
            "text",
            "en",
            1,
            "Furthermore the formal systematic methodology provides comprehensive analysis for evaluation.",
        ),
        GoldenRecord(
            "human",
            "text",
            "en",
            0,
            "I tried several approaches and changed the wording after reading the results yesterday.",
        ),
    ]
    metrics = evaluate_golden_dataset(detector, records)
    assert 0.0 <= metrics.precision <= 1.0
    assert 0.0 <= metrics.recall <= 1.0
    assert 0.0 <= metrics.f1 <= 1.0
    assert 0.0 <= metrics.brier_score <= 1.0
    assert "en" in metrics.by_language
