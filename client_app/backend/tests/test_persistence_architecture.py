from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    AffectedRegion,
    AnalysisConfiguration,
    AnalysisJob,
    AnalysisJobResult,
    AnalysisJobV2,
    AnalysisResult,
    AnalysisTrace,
    AuditLog,
    Claim,
    ClaimSource,
    CorpusItemExtended,
    Dataset,
    DatasetVersion,
    DatasetVersionExtended,
    DatasetVersionItemExt,
    DriftEvent,
    Evidence,
    EvidenceGraph,
    Explanation,
    Feedback,
    Model,
    ModelDeployment,
    ModelVersion,
    RetrievalQuery,
    RetrievalResult,
    SearchSource,
    TrainingJob,
    TrainingRun,
    User,
    UserRole,
)
from app.models.base import Base


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def test_provenance_entities_support_end_to_end_traversal(db_session: Session):
    user = User(phone="9999999999", username="architect", password_hash="hash", role=UserRole.ML_ENGINEER)
    db_session.add(user)
    db_session.flush()
    dataset = Dataset(name="verified-text", media_type="text", created_by=user.id)
    db_session.add(dataset)
    db_session.flush()
    corpus_item = CorpusItemExtended(
        media_type="text",
        source="reviewed",
        content_hash="a" * 64,
        title="Reviewed sample",
        status="APPROVED",
        quality_status="passed",
        annotation_status="annotated",
        training_eligible=True,
    )
    db_session.add(corpus_item)
    db_session.flush()
    dataset_version = DatasetVersionExtended(dataset_id=dataset.id, version="v1", is_sealed=False)
    db_session.add(dataset_version)
    db_session.flush()
    legacy_dataset_version = DatasetVersion(dataset_id=dataset.id, version="v1")
    db_session.add(legacy_dataset_version)
    db_session.flush()
    training_job = TrainingJob(model_name="text-detector", dataset_version_id=legacy_dataset_version.id)
    training_run = TrainingRun(
        training_job=training_job, dataset_version_id=legacy_dataset_version.id, status="succeeded"
    )
    model = Model(name="text-detector", media_type="text")
    model_version = ModelVersion(
        model=model,
        version="v1",
        status="production",
        training_run=training_run,
        trained_at=datetime.now(UTC),
    )
    legacy_job = AnalysisJob(user_id=user.id, input_type="text", status="completed")
    legacy_result = AnalysisResult(
        analysis_job=legacy_job,
        ai_score=0.4,
        human_score=0.6,
        confidence=0.4,
        risk_level="low",
    )
    explanation = Explanation(analysis_result=legacy_result, narrative="Signal-based explanation")
    configuration = AnalysisConfiguration(
        name="default-analysis",
        version="v1",
        task="verification",
        configuration_json='{"retrieval":"hybrid"}',
        explanation_method="signal-attribution",
    )
    job = AnalysisJobV2(
        user_id=user.id,
        modality="text",
        status="completed",
        preprocessing_version="preprocess-v1",
        feature_version="features-v1",
        configuration=configuration,
    )
    result = AnalysisJobResult(
        job=job,
        assessment="inconclusive",
        confidence=0.4,
        risk_level="low",
        model_version=model_version,
        dataset_version_extended=dataset_version,
        configuration=configuration,
        preprocessing_version="preprocess-v1",
        feature_version="features-v1",
    )
    source = SearchSource(
        source_type="corpus",
        name="Verified Corpus",
        locator="corpus://sample-1",
        retrieved_at=datetime.now(UTC),
    )
    db_session.add_all([model, configuration, job])
    db_session.flush()
    query = RetrievalQuery(analysis_job_id=job.id, query_text="sample claim", embedding_version="embed-v1")
    db_session.add_all([source, query])
    db_session.flush()
    retrieval = RetrievalResult(query_id=query.id, search_source_id=source.id, rank=1, retrieval_score=0.9)
    claim = Claim(analysis_job_id=job.id, text="A verifiable claim")
    evidence = Evidence(
        analysis_job_id=job.id,
        source_id=source.id,
        evidence_type="corpus_match",
        content="Supporting evidence",
        support_score=0.95,
    )
    db_session.add_all([retrieval, claim, evidence])
    db_session.flush()
    trace = AnalysisTrace(
        analysis_job_id=job.id,
        preprocessing_version="preprocess-v1",
        feature_extraction_version="features-v1",
        model_versions_json='["v1"]',
        dataset_versions_json='["v1"]',
        embedding_version="embed-v1",
        retrieval_config_json='{"top_k":10}',
        retrieved_source_ids_json=f'["{source.id}"]',
        explanation_method="signal-attribution",
        analysis_timestamp=datetime.now(UTC),
    )
    deployment = ModelDeployment(
        model=model,
        model_version=model_version,
        environment="production",
        is_active=True,
    )
    graph = EvidenceGraph(
        analysis_job_id=job.id,
        graph_json='{"nodes":["claim","evidence"]}',
        construction_method="claim-evidence-v1",
    )
    feedback = Feedback(
        analysis_job_id=job.id,
        user_id=user.id,
        feedback_type="review",
        label="inconclusive",
    )
    affected_region = AffectedRegion(
        analysis_job_id=job.id,
        region_json='{"start":0,"end":10}',
        score=0.4,
        explanation="No concentrated region",
    )
    drift_event = DriftEvent(
        model_id=model.id,
        metric_name="confidence",
        observed_value=0.4,
        drift_score=0.1,
        severity="low",
    )
    audit_log = AuditLog(
        user_id=user.id,
        action="analysis_created",
        resource_type="analysis_job_v2",
        resource_id=job.id,
    )
    db_session.add_all(
        [
            DatasetVersionItemExt(dataset_version=dataset_version, corpus_item=corpus_item),
            training_job,
            training_run,
            result,
            legacy_job,
            legacy_result,
            explanation,
            ClaimSource(claim_id=claim.id, evidence_id=evidence.id),
            trace,
            deployment,
            graph,
            feedback,
            affected_region,
            drift_event,
            audit_log,
        ]
    )
    dataset_version.is_sealed = True
    db_session.commit()

    persisted_result = db_session.scalar(select(AnalysisJobResult).where(AnalysisJobResult.id == result.id))
    assert persisted_result.model_version.training_run.dataset_version_id == legacy_dataset_version.id
    assert persisted_result.dataset_version_extended.id == dataset_version.id
    assert (
        db_session.scalar(select(RetrievalResult).where(RetrievalResult.id == retrieval.id)).search_source_id
        == source.id
    )
    assert (
        db_session.scalar(select(ModelDeployment).where(ModelDeployment.is_active.is_(True))).model_version_id
        == model_version.id
    )


def test_sealed_dataset_versions_are_immutable(db_session: Session):
    dataset = Dataset(name="immutable", media_type="text")
    db_session.add(dataset)
    db_session.flush()
    version = DatasetVersionExtended(dataset_id=dataset.id, version="v1", is_sealed=False)
    db_session.add(version)
    version.is_sealed = True
    db_session.commit()

    version.description = "attempted mutation"
    with pytest.raises(ValueError, match="immutable"):
        db_session.commit()
    db_session.rollback()

    db_session.delete(version)
    with pytest.raises(ValueError, match="cannot be deleted"):
        db_session.commit()
    db_session.rollback()

    legacy = DatasetVersion(dataset_id=dataset.id, version="v2", is_sealed=False)
    db_session.add(legacy)
    db_session.flush()
    legacy.is_sealed = True
    db_session.commit()
    legacy.description = "attempted legacy mutation"
    with pytest.raises(ValueError, match="immutable"):
        db_session.commit()


def test_production_constraints_reject_duplicate_versions_and_invalid_embeddings(db_session: Session):
    model = Model(name="unique-model", media_type="text")
    db_session.add(model)
    db_session.flush()
    db_session.add_all(
        [
            ModelVersion(model_id=model.id, version="v1"),
            ModelVersion(model_id=model.id, version="v1"),
        ]
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
