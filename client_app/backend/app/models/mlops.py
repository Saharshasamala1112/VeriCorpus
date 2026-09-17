"""
MLOps Pipeline Models

Models for continuous learning, training management, model evaluation,
promotion, drift monitoring, and active learning.
"""

from __future__ import annotations

import enum
from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .all_models import Model, ModelVersion
from .base import Base, TimestampMixin, generate_uuid

# ─── Enums ──────────────────────────────────────────────────────────────────────


class TrainingJobStatus(enum.StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    EVALUATING = "evaluating"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ModelStage(enum.StrEnum):
    CANDIDATE = "candidate"
    STAGING = "staging"
    PRODUCTION = "production"
    RETIRED = "retired"


class ModelLifecycleStatus(enum.StrEnum):
    NOT_CONFIGURED = "NOT_CONFIGURED"
    INITIALIZING = "INITIALIZING"
    TRAINING = "TRAINING"
    TRAINED = "TRAINED"
    VALIDATING = "VALIDATING"
    CANDIDATE = "CANDIDATE"
    STAGING = "STAGING"
    PRODUCTION = "PRODUCTION"
    FAILED = "FAILED"
    RETIRED = "RETIRED"


VALID_STATUS_TRANSITIONS: dict[ModelLifecycleStatus, list[ModelLifecycleStatus]] = {
    ModelLifecycleStatus.NOT_CONFIGURED: [
        ModelLifecycleStatus.INITIALIZING,
        ModelLifecycleStatus.FAILED,
    ],
    ModelLifecycleStatus.INITIALIZING: [
        ModelLifecycleStatus.TRAINING,
        ModelLifecycleStatus.FAILED,
    ],
    ModelLifecycleStatus.TRAINING: [
        ModelLifecycleStatus.TRAINED,
        ModelLifecycleStatus.FAILED,
    ],
    ModelLifecycleStatus.TRAINED: [
        ModelLifecycleStatus.VALIDATING,
        ModelLifecycleStatus.FAILED,
    ],
    ModelLifecycleStatus.VALIDATING: [
        ModelLifecycleStatus.CANDIDATE,
        ModelLifecycleStatus.FAILED,
    ],
    ModelLifecycleStatus.CANDIDATE: [
        ModelLifecycleStatus.STAGING,
        ModelLifecycleStatus.RETIRED,
    ],
    ModelLifecycleStatus.STAGING: [
        ModelLifecycleStatus.PRODUCTION,
        ModelLifecycleStatus.CANDIDATE,
        ModelLifecycleStatus.RETIRED,
    ],
    ModelLifecycleStatus.PRODUCTION: [
        ModelLifecycleStatus.RETIRED,
        ModelLifecycleStatus.STAGING,
    ],
    ModelLifecycleStatus.FAILED: [
        ModelLifecycleStatus.INITIALIZING,
        ModelLifecycleStatus.RETIRED,
    ],
    ModelLifecycleStatus.RETIRED: [],
}


class ModelAliasType(enum.StrEnum):
    DEVELOPMENT = "development"
    CANDIDATE = "candidate"
    STAGING = "staging"
    PRODUCTION = "production"
    CHAMPION = "champion"
    ROLLBACK = "rollback"


class TriggerType(enum.StrEnum):
    MANUAL = "manual"
    SAMPLE_THRESHOLD = "sample_threshold"
    SCHEDULED = "scheduled"
    DATASET_VERSION = "dataset_version"


class ApprovalStatus(enum.StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AuditAction(enum.StrEnum):
    DATASET_CREATED = "dataset_created"
    DATASET_APPROVED = "dataset_approved"
    TRAINING_INITIATED = "training_initiated"
    MODEL_EVALUATED = "model_evaluated"
    MODEL_PROMOTED = "model_promoted"
    MODEL_ROLLED_BACK = "model_rolled_back"
    DRIFT_DETECTED = "drift_detected"
    ANNOTATION_ADDED = "annotation_added"
    MODEL_CREATED = "model_created"
    MODEL_VERSION_CREATED = "model_version_created"
    MODEL_STATUS_CHANGED = "model_status_changed"
    MODEL_TRAINED = "model_trained"
    MODEL_RETURED = "model_retired"
    MODEL_ARTIFACT_UPLOADED = "model_artifact_uploaded"
    MODEL_ALIAS_ASSIGNED = "model_alias_assigned"
    MODEL_ALIAS_REMOVED = "model_alias_removed"
    EXPERIMENT_STARTED = "experiment_started"
    EXPERIMENT_COMPLETED = "experiment_completed"
    EXPERIMENT_FAILED = "experiment_failed"
    DEPLOYMENT_CREATED = "deployment_created"
    DEPLOYMENT_UPDATED = "deployment_updated"
    DEPLOYMENT_ROLLED_BACK = "deployment_rolled_back"


# ─── Data Pipeline Models ─────────────────────────────────────────────────────


class DatasetCandidate(TimestampMixin, Base):
    """Represents a dataset candidate awaiting validation and approval."""

    __tablename__ = "dataset_candidates"
    __table_args__ = (
        Index("idx_dataset_candidate_status", "approval_status"),
        Index("idx_dataset_candidate_media", "media_type"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_type: Mapped[str] = mapped_column(String(20), nullable=False)
    sample_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    storage_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    approval_status: Mapped[str] = mapped_column(String(20), default=ApprovalStatus.PENDING.value, nullable=False)
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)

    # Quality metrics from validation
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    validation_report: Mapped[str | None] = mapped_column(JSON, nullable=True)

    # Relationships
    quality_checks: Mapped[list[DatasetQualityCheck]] = relationship(
        back_populates="dataset_candidate", cascade="all, delete-orphan"
    )


class DatasetQualityCheck(TimestampMixin, Base):
    """Quality check results for a dataset candidate."""

    __tablename__ = "dataset_quality_checks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    dataset_candidate_id: Mapped[str] = mapped_column(ForeignKey("dataset_candidates.id"), nullable=False)
    check_name: Mapped[str] = mapped_column(String(100), nullable=False)
    check_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # passed, failed, warning
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    details: Mapped[str | None] = mapped_column(JSON, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)

    dataset_candidate: Mapped[DatasetCandidate] = relationship(back_populates="quality_checks")


# ─── Training Pipeline Models ────────────────────────────────────────────────


class TrainingTrigger(TimestampMixin, Base):
    """Configurable training trigger with strategies."""

    __tablename__ = "training_triggers"
    __table_args__ = (Index("idx_trigger_active", "is_active"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    config: Mapped[str | None] = mapped_column(JSON, nullable=True)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)


class TrainingJobV2(TimestampMixin, Base):
    """Enhanced training job with full lifecycle tracking."""

    __tablename__ = "training_jobs_v2"
    __table_args__ = (
        Index("idx_training_job_v2_status", "status"),
        Index("idx_training_job_v2_model", "model_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    job_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"), nullable=False)
    dataset_candidate_id: Mapped[str] = mapped_column(ForeignKey("dataset_candidates.id"), nullable=False)
    trigger_id: Mapped[str | None] = mapped_column(ForeignKey("training_triggers.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=TrainingJobStatus.QUEUED.value, nullable=False)

    # Configuration
    base_model_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    hyperparameters: Mapped[str | None] = mapped_column(JSON, nullable=True)
    compute_config: Mapped[str | None] = mapped_column(JSON, nullable=True)
    config_snapshot: Mapped[str | None] = mapped_column(JSON, nullable=True)

    # Lifecycle timestamps
    queued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Results
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    artifact_location: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    logs_location: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # Relationships
    model: Mapped[Model] = relationship(foreign_keys=[model_id])
    dataset_candidate: Mapped[DatasetCandidate] = relationship(foreign_keys=[dataset_candidate_id])
    trigger: Mapped[TrainingTrigger | None] = relationship(foreign_keys=[trigger_id])
    evaluation_runs: Mapped[list[ModelEvaluation]] = relationship(
        back_populates="training_job", cascade="all, delete-orphan"
    )


# ─── Model Evaluation Models ──────────────────────────────────────────────────


class ModelEvaluation(TimestampMixin, Base):
    """Model evaluation results with comparison against production."""

    __tablename__ = "model_evaluations"
    __table_args__ = (
        Index("idx_evaluation_job", "training_job_id"),
        Index("idx_evaluation_status", "approval_status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    training_job_id: Mapped[str] = mapped_column(ForeignKey("training_jobs_v2.id"), nullable=False)
    model_version_id: Mapped[str] = mapped_column(ForeignKey("model_versions.id"), nullable=False)
    production_model_version_id: Mapped[str | None] = mapped_column(ForeignKey("model_versions.id"), nullable=True)

    # Metrics (separated by dataset split)
    training_metrics: Mapped[str | None] = mapped_column(JSON, nullable=True)
    validation_metrics: Mapped[str | None] = mapped_column(JSON, nullable=True)
    test_metrics: Mapped[str | None] = mapped_column(JSON, nullable=True)
    production_metrics: Mapped[str | None] = mapped_column(JSON, nullable=True)

    # Comparison
    improvement_over_production: Mapped[str | None] = mapped_column(JSON, nullable=True)
    meets_thresholds: Mapped[bool | None] = mapped_column(nullable=True)
    threshold_config: Mapped[str | None] = mapped_column(JSON, nullable=True)

    # Approval
    approval_status: Mapped[str] = mapped_column(String(20), default=ApprovalStatus.PENDING.value, nullable=False)
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    training_job: Mapped[TrainingJobV2] = relationship(back_populates="evaluation_runs")
    model_version: Mapped[ModelVersion] = relationship(foreign_keys=[model_version_id])
    production_model_version: Mapped[ModelVersion | None] = relationship(foreign_keys=[production_model_version_id])


# ─── Model Promotion Models ───────────────────────────────────────────────────


class ModelPromotion(TimestampMixin, Base):
    """Tracks model promotion decisions and rollback history."""

    __tablename__ = "model_promotions"
    __table_args__ = (Index("idx_promotion_model", "model_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"), nullable=False)
    from_version_id: Mapped[str | None] = mapped_column(ForeignKey("model_versions.id"), nullable=True)
    to_version_id: Mapped[str] = mapped_column(ForeignKey("model_versions.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # promote, rollback
    from_stage: Mapped[str] = mapped_column(String(50), nullable=False)
    to_stage: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    performed_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)

    # Relationships
    model: Mapped[Model] = relationship(foreign_keys=[model_id])
    from_version: Mapped[ModelVersion | None] = relationship(foreign_keys=[from_version_id])
    to_version: Mapped[ModelVersion] = relationship(foreign_keys=[to_version_id])


class ModelDeployment(TimestampMixin, Base):
    """Deployment history and the currently active model version."""

    __tablename__ = "model_deployments"
    __table_args__ = (
        Index("idx_model_deployment_model", "model_id"),
        Index("idx_model_deployment_active", "is_active"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"), nullable=False)
    model_version_id: Mapped[str] = mapped_column(ForeignKey("model_versions.id"), nullable=False)
    environment: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=False, nullable=False)
    deployed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    deployed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    configuration_json: Mapped[str | None] = mapped_column(JSON, nullable=True)

    model: Mapped[Model] = relationship(foreign_keys=[model_id])
    model_version: Mapped[ModelVersion] = relationship(foreign_keys=[model_version_id])


# ─── Drift Monitoring Models ──────────────────────────────────────────────────


class DriftSnapshot(TimestampMixin, Base):
    """Point-in-time snapshot of distribution metrics for drift detection."""

    __tablename__ = "drift_snapshots"
    __table_args__ = (
        Index("idx_drift_model", "model_id"),
        Index("idx_drift_metric", "metric_type"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"), nullable=False)
    metric_type: Mapped[str] = mapped_column(String(50), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_value: Mapped[float] = mapped_column(Float, nullable=False)
    baseline_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    drift_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_drifting: Mapped[bool] = mapped_column(default=False, nullable=False)
    sample_size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    metadata_: Mapped[str | None] = mapped_column("metadata", JSON, nullable=True)


# ─── Active Learning Models ───────────────────────────────────────────────────


class ActiveLearningCandidate(TimestampMixin, Base):
    """Samples selected for future annotation/training via active learning."""

    __tablename__ = "active_learning_candidates"
    __table_args__ = (
        Index("idx_alc_status", "status"),
        Index("idx_alc_reason", "selection_reason"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    sample_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    media_type: Mapped[str] = mapped_column(String(20), nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    selection_reason: Mapped[str] = mapped_column(String(50), nullable=False)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    disagreement_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    annotation: Mapped[str | None] = mapped_column(JSON, nullable=True)
    annotated_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    annotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ─── Audit Trail Models ───────────────────────────────────────────────────────


class MLOpsAuditLog(TimestampMixin, Base):
    """Audit log for all MLOps operations."""

    __tablename__ = "mlops_audit_logs"
    __table_args__ = (
        Index("idx_mlops_audit_action", "action"),
        Index("idx_mlops_audit_resource", "resource_type", "resource_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    details: Mapped[str | None] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    metadata_: Mapped[str | None] = mapped_column("metadata", JSON, nullable=True)


# ─── Reproducibility Models ───────────────────────────────────────────────────


class ExperimentRun(TimestampMixin, Base):
    """Tracks experiment runs for reproducibility."""

    __tablename__ = "experiment_runs"
    __table_args__ = (Index("idx_experiment_name", "experiment_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    experiment_name: Mapped[str] = mapped_column(String(200), nullable=False)
    run_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    run_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    training_job_id: Mapped[str | None] = mapped_column(ForeignKey("training_jobs_v2.id"), nullable=True)
    model_version_id: Mapped[str | None] = mapped_column(ForeignKey("model_versions.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="RUNNING", nullable=False)
    parameters: Mapped[str | None] = mapped_column(JSON, nullable=True)
    metrics: Mapped[str | None] = mapped_column(JSON, nullable=True)
    artifacts: Mapped[str | None] = mapped_column(JSON, nullable=True)
    tags: Mapped[str | None] = mapped_column(JSON, nullable=True)
    git_commit: Mapped[str | None] = mapped_column(String(40), nullable=True)
    environment: Mapped[str | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    model_version: Mapped[ModelVersion | None] = relationship(foreign_keys=[model_version_id])


# ─── Model Version Alias Models ───────────────────────────────────────────────


class ModelVersionAlias(TimestampMixin, Base):
    """MLflow-compatible model version aliases.

    Each alias (e.g. 'production', 'champion', 'rollback') points to exactly
    one model version.  Only one version per model may hold a given alias at
    any time.
    """

    __tablename__ = "model_version_aliases"
    __table_args__ = (
        UniqueConstraint("model_id", "alias", name="uq_model_alias"),
        Index("idx_mva_model", "model_id"),
        Index("idx_mva_alias", "alias"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"), nullable=False)
    model_version_id: Mapped[str] = mapped_column(ForeignKey("model_versions.id"), nullable=False)
    alias: Mapped[str] = mapped_column(String(50), nullable=False)
    assigned_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    model: Mapped[Model] = relationship(foreign_keys=[model_id])
    model_version: Mapped[ModelVersion] = relationship(foreign_keys=[model_version_id])


# ─── Model Version Extended Metadata ──────────────────────────────────────────


class ModelVersionMetadata(TimestampMixin, Base):
    """Extended metadata for model versions.

    Stores the full provenance chain: preprocessing, tokenizer, embedding,
    calibration, deployment, and artifact location.
    """

    __tablename__ = "model_version_metadata"
    __table_args__ = (Index("idx_mvm_version", "model_version_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    model_version_id: Mapped[str] = mapped_column(ForeignKey("model_versions.id"), unique=True, nullable=False)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    modality: Mapped[str] = mapped_column(String(20), nullable=False)
    architecture: Mapped[str | None] = mapped_column(String(200), nullable=True)
    dataset_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    preprocessing_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tokenizer_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    embedding_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    checkpoint: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    artifact_uri: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    evaluation_run_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    calibration: Mapped[str | None] = mapped_column(JSON, nullable=True)
    deployment: Mapped[str | None] = mapped_column(JSON, nullable=True)
    retirement_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    parent_version_id: Mapped[str | None] = mapped_column(ForeignKey("model_versions.id"), nullable=True)
    changelog: Mapped[str | None] = mapped_column(Text, nullable=True)

    model_version: Mapped[ModelVersion] = relationship(
        foreign_keys=[model_version_id], back_populates="extended_metadata"
    )
    parent_version: Mapped[ModelVersion | None] = relationship(foreign_keys=[parent_version_id], uselist=False)


# ─── Model Comparison ─────────────────────────────────────────────────────────


class ModelComparison(TimestampMixin, Base):
    """Head-to-head comparison between a candidate and production model version."""

    __tablename__ = "model_comparisons"
    __table_args__ = (Index("idx_mc_candidate", "candidate_version_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    production_version_id: Mapped[str] = mapped_column(ForeignKey("model_versions.id"), nullable=False)
    candidate_version_id: Mapped[str] = mapped_column(ForeignKey("model_versions.id"), nullable=False)
    overall_winner: Mapped[str] = mapped_column(String(20), nullable=False)
    overall_score_delta: Mapped[float] = mapped_column(Float, nullable=False)
    metrics_comparison: Mapped[str | None] = mapped_column(JSON, nullable=True)
    per_modality_comparison: Mapped[str | None] = mapped_column(JSON, nullable=True)
    false_positive_delta: Mapped[float | None] = mapped_column(Float, nullable=True)
    false_negative_delta: Mapped[float | None] = mapped_column(Float, nullable=True)
    calibration_delta: Mapped[float | None] = mapped_column(Float, nullable=True)
    regression_detected: Mapped[bool] = mapped_column(default=False, nullable=False)
    regression_details: Mapped[str | None] = mapped_column(JSON, nullable=True)
    promotion_recommendation: Mapped[str] = mapped_column(String(20), nullable=False)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    production_version: Mapped[ModelVersion] = relationship(foreign_keys=[production_version_id])
    candidate_version: Mapped[ModelVersion] = relationship(foreign_keys=[candidate_version_id])


# ─── Model Lineage Edge ───────────────────────────────────────────────────────


class ModelLineageEdge(TimestampMixin, Base):
    """Directed edge in the model lineage graph.

    Connects two model versions with a typed relationship so the full
    training / promotion / rollback history is queryable.
    """

    __tablename__ = "model_lineage_edges"
    __table_args__ = (
        Index("idx_mle_from", "from_version_id"),
        Index("idx_mle_to", "to_version_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"), nullable=False)
    from_version_id: Mapped[str] = mapped_column(ForeignKey("model_versions.id"), nullable=False)
    to_version_id: Mapped[str] = mapped_column(ForeignKey("model_versions.id"), nullable=False)
    edge_type: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    metadata_: Mapped[str | None] = mapped_column("metadata", JSON, nullable=True)

    model: Mapped[Model] = relationship(foreign_keys=[model_id])
    from_version: Mapped[ModelVersion] = relationship(foreign_keys=[from_version_id])
    to_version: Mapped[ModelVersion] = relationship(foreign_keys=[to_version_id])


# ─── Production Inference Tracking ────────────────────────────────────────────


class ProductionInferenceRecord(TimestampMixin, Base):
    """Tracks which exact model version was used for each inference request.

    Ensures production inference always identifies the exact model version.
    """

    __tablename__ = "production_inference_records"
    __table_args__ = (
        Index("idx_pir_model_version", "model_version_id"),
        Index("idx_pir_request_id", "request_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    request_id: Mapped[str] = mapped_column(String(100), nullable=False)
    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"), nullable=False)
    model_version_id: Mapped[str] = mapped_column(ForeignKey("model_versions.id"), nullable=False)
    alias_at_inference: Mapped[str | None] = mapped_column(String(50), nullable=True)
    endpoint: Mapped[str | None] = mapped_column(String(200), nullable=True)
    environment: Mapped[str | None] = mapped_column(String(50), nullable=True)
    latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    input_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    output_summary: Mapped[str | None] = mapped_column(JSON, nullable=True)

    model: Mapped[Model] = relationship(foreign_keys=[model_id])
    model_version: Mapped[ModelVersion] = relationship(foreign_keys=[model_version_id])
