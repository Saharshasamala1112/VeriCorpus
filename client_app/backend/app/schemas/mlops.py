"""
MLOps Pipeline Schemas

Pydantic schemas for the continuous learning and MLOps pipeline.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from .common import BaseSchema

# ─── Dataset Candidate Schemas ────────────────────────────────────────────────


class DatasetCandidateCreate(BaseSchema):
    """Schema for creating a new dataset candidate."""

    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    media_type: str = Field(..., min_length=1, max_length=20)
    storage_path: str | None = None
    sample_count: int = Field(0, ge=0)


class DatasetCandidateResponse(BaseSchema):
    """Schema for dataset candidate response."""

    id: str
    name: str
    description: str | None
    media_type: str
    sample_count: int
    checksum: str | None
    approval_status: str
    quality_score: float | None
    validation_report: dict[str, Any] | None
    created_by: str
    approved_by: str | None
    approved_at: datetime | None
    rejection_reason: str | None
    created_at: datetime
    updated_at: datetime


class DatasetCandidateApproval(BaseSchema):
    """Schema for approving/rejecting a dataset candidate."""

    approved: bool
    rejection_reason: str | None = None


# ─── Quality Check Schemas ────────────────────────────────────────────────────


class QualityCheckResponse(BaseSchema):
    """Schema for quality check response."""

    id: str
    dataset_candidate_id: str
    check_name: str
    check_type: str
    status: str
    score: float | None
    details: dict[str, Any] | None
    message: str | None
    created_at: datetime


# ─── Training Trigger Schemas ─────────────────────────────────────────────────


class TrainingTriggerCreate(BaseSchema):
    """Schema for creating a training trigger."""

    name: str = Field(..., min_length=1, max_length=200)
    trigger_type: str = Field(
        ...,
        pattern="^(manual|sample_threshold|scheduled|dataset_version|significant_new_data|feedback_threshold|drift_threshold)$",
    )
    config: dict[str, Any] | None = None


class TrainingTriggerResponse(BaseSchema):
    """Schema for training trigger response."""

    id: str
    name: str
    trigger_type: str
    is_active: bool
    config: dict[str, Any] | None
    last_triggered_at: datetime | None
    created_by: str
    created_at: datetime
    updated_at: datetime


class TrainingTriggerUpdate(BaseSchema):
    """Schema for updating a training trigger."""

    name: str | None = None
    is_active: bool | None = None
    config: dict[str, Any] | None = None


# ─── Training Job Schemas ─────────────────────────────────────────────────────


class TrainingJobCreate(BaseSchema):
    """Schema for creating a training job."""

    model_id: str
    dataset_candidate_id: str
    trigger_id: str | None = None
    base_model_version: str | None = None
    hyperparameters: dict[str, Any] | None = None
    compute_config: dict[str, Any] | None = None


class TrainingJobResponse(BaseSchema):
    """Schema for training job response."""

    id: str
    job_id: str
    model_id: str
    dataset_candidate_id: str
    trigger_id: str | None
    status: str
    base_model_version: str | None
    hyperparameters: dict[str, Any] | None
    compute_config: dict[str, Any] | None
    config_snapshot: dict[str, Any] | None
    queued_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    artifact_location: str | None
    logs_location: str | None
    created_at: datetime
    updated_at: datetime


class TrainingJobStatusUpdate(BaseSchema):
    """Schema for updating training job status."""

    status: str = Field(..., pattern="^(running|evaluating|succeeded|failed|cancelled)$")
    error_message: str | None = None
    artifact_location: str | None = None
    logs_location: str | None = None


# ─── Model Evaluation Schemas ─────────────────────────────────────────────────


class ModelEvaluationCreate(BaseSchema):
    """Schema for creating a model evaluation."""

    training_job_id: str
    model_version_id: str
    production_model_version_id: str | None = None


class ModelEvaluationResponse(BaseSchema):
    """Schema for model evaluation response."""

    id: str
    training_job_id: str
    model_version_id: str
    production_model_version_id: str | None
    training_metrics: dict[str, Any] | None
    validation_metrics: dict[str, Any] | None
    test_metrics: dict[str, Any] | None
    production_metrics: dict[str, Any] | None
    improvement_over_production: dict[str, Any] | None
    meets_thresholds: bool | None
    threshold_config: dict[str, Any] | None
    approval_status: str
    reviewed_by: str | None
    reviewed_at: datetime | None
    review_notes: str | None
    created_at: datetime
    updated_at: datetime


class ModelEvaluationMetricsUpdate(BaseSchema):
    """Schema for updating evaluation metrics."""

    training_metrics: dict[str, Any] | None = None
    validation_metrics: dict[str, Any] | None = None
    test_metrics: dict[str, Any] | None = None
    production_metrics: dict[str, Any] | None = None
    improvement_over_production: dict[str, Any] | None = None
    meets_thresholds: bool | None = None


class ModelEvaluationApproval(BaseSchema):
    """Schema for approving/rejecting a model evaluation."""

    approved: bool
    review_notes: str | None = None


# ─── Model Promotion Schemas ──────────────────────────────────────────────────


class ModelPromotionCreate(BaseSchema):
    """Schema for creating a model promotion."""

    model_id: str
    to_version_id: str
    reason: str | None = None


class ModelPromotionResponse(BaseSchema):
    """Schema for model promotion response."""

    id: str
    model_id: str
    from_version_id: str | None
    to_version_id: str
    action: str
    from_stage: str
    to_stage: str
    reason: str | None
    performed_by: str
    created_at: datetime
    updated_at: datetime


class ModelRollbackCreate(BaseSchema):
    """Schema for rolling back a model."""

    model_id: str
    target_version_id: str
    reason: str = Field(..., min_length=1)


# ─── Drift Monitoring Schemas ─────────────────────────────────────────────────


class DriftSnapshotCreate(BaseSchema):
    """Schema for creating a drift snapshot."""

    model_id: str
    metric_type: str = Field(
        ...,
        pattern="^(language_distribution|modality_distribution|class_distribution|confidence_distribution|input_distribution)$",
    )
    metric_name: str = Field(..., min_length=1, max_length=100)
    metric_value: float
    baseline_value: float | None = None
    sample_size: int = Field(0, ge=0)
    metadata: dict[str, Any] | None = None


class DriftSnapshotResponse(BaseSchema):
    """Schema for drift snapshot response."""

    id: str
    model_id: str
    metric_type: str
    metric_name: str
    metric_value: float
    baseline_value: float | None
    drift_score: float | None
    is_drifting: bool
    sample_size: int
    metadata: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class DriftAlert(BaseSchema):
    """Schema for drift alerts."""

    model_id: str
    metric_type: str
    metric_name: str
    current_value: float
    baseline_value: float
    drift_score: float
    severity: str  # low, medium, high, critical


# ─── Active Learning Schemas ──────────────────────────────────────────────────


class ActiveLearningCandidateCreate(BaseSchema):
    """Schema for creating an active learning candidate."""

    sample_id: str = Field(..., min_length=1, max_length=100)
    media_type: str = Field(..., min_length=1, max_length=20)
    source: str = Field(..., min_length=1, max_length=100)
    selection_reason: str = Field(..., pattern="^(low_confidence|disagreement|reviewer_selected|random)$")
    confidence_score: float | None = None
    disagreement_score: float | None = None
    priority: int = Field(0, ge=0, le=100)


class ActiveLearningCandidateResponse(BaseSchema):
    """Schema for active learning candidate response."""

    id: str
    sample_id: str
    media_type: str
    source: str
    selection_reason: str
    confidence_score: float | None
    disagreement_score: float | None
    priority: int
    status: str
    annotation: dict[str, Any] | None
    annotated_by: str | None
    annotated_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ActiveLearningAnnotation(BaseSchema):
    """Schema for annotating an active learning candidate."""

    label: str = Field(..., min_length=1)
    confidence: float = Field(..., ge=0.0, le=1.0)
    notes: str | None = None


# ─── Audit Log Schemas ────────────────────────────────────────────────────────


class MLOpsAuditLogResponse(BaseSchema):
    """Schema for MLOps audit log response."""

    id: str
    action: str
    resource_type: str
    resource_id: str | None
    user_id: str | None
    details: dict[str, Any] | None
    ip_address: str | None
    metadata: dict[str, Any] | None
    created_at: datetime


# ─── Experiment Run Schemas ───────────────────────────────────────────────────


class ExperimentRunCreate(BaseSchema):
    """Schema for creating an experiment run."""

    experiment_name: str = Field(..., min_length=1, max_length=200)
    run_id: str = Field(..., min_length=1, max_length=100)
    run_name: str | None = None
    training_job_id: str | None = None
    model_version_id: str | None = None
    parameters: dict[str, Any] | None = None
    git_commit: str | None = None
    environment: dict[str, Any] | None = None
    notes: str | None = None


class ExperimentRunResponse(BaseSchema):
    """Schema for experiment run response."""

    id: str
    experiment_name: str
    run_id: str
    run_name: str | None
    training_job_id: str | None
    model_version_id: str | None
    status: str
    parameters: dict[str, Any] | None
    metrics: dict[str, Any] | None
    artifacts: list[dict[str, Any]] | None
    tags: dict[str, str] | None
    git_commit: str | None
    environment: dict[str, Any] | None
    notes: str | None
    started_at: datetime | None
    ended_at: datetime | None
    duration_ms: int | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime


class ExperimentRunComplete(BaseSchema):
    """Schema for completing an experiment run."""

    metrics: dict[str, Any] | None = None
    artifacts: list[dict[str, Any]] | None = None


class ExperimentRunFail(BaseSchema):
    """Schema for failing an experiment run."""

    error_message: str | None = None


class ExperimentRunMetricsUpdate(BaseSchema):
    """Schema for logging additional metrics."""

    metrics: dict[str, float] = Field(..., min_length=1)


# ─── Model Registration Schemas ───────────────────────────────────────────────


class ModelVersionRegister(BaseSchema):
    """Schema for registering a new model version."""

    model_id: str
    version: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    modality: str = Field(..., min_length=1, max_length=20)
    architecture: str | None = None
    dataset_version: str | None = None
    preprocessing_version: str | None = None
    tokenizer_version: str | None = None
    embedding_version: str | None = None
    training_run_id: str | None = None
    checkpoint: str | None = None
    artifact_uri: str | None = None
    evaluation_run_id: str | None = None
    calibration: dict[str, Any] | None = None
    parent_version_id: str | None = None
    changelog: str | None = None
    tags: dict[str, str] | None = None


class ModelVersionResponse(BaseSchema):
    """Schema for model version response with full metadata."""

    id: str
    model_id: str
    version: str
    status: str
    name: str | None
    modality: str | None
    architecture: str | None
    dataset_version: str | None
    preprocessing_version: str | None
    tokenizer_version: str | None
    embedding_version: str | None
    training_run_id: str | None
    checkpoint: str | None
    artifact_uri: str | None
    evaluation_run_id: str | None
    calibration: dict[str, Any] | None
    deployment: dict[str, Any] | None
    retirement_at: datetime | None
    parent_version_id: str | None
    changelog: str | None
    aliases: list[str]
    tags: dict[str, str]
    metrics: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ModelVersionStatusUpdate(BaseSchema):
    """Schema for updating model version status."""

    status: str = Field(
        ...,
        pattern="^(NOT_CONFIGURED|INITIALIZING|TRAINING|TRAINED|VALIDATING|CANDIDATE|STAGING|PRODUCTION|FAILED|RETIRED)$",
    )
    reason: str | None = None


class ModelAliasAssign(BaseSchema):
    """Schema for assigning an alias to a model version."""

    alias: str = Field(
        ...,
        pattern="^(development|candidate|staging|production|champion|rollback)$",
    )


class ModelAliasResponse(BaseSchema):
    """Schema for model alias response."""

    alias: str
    model_id: str
    model_version_id: str
    assigned_by: str | None
    assigned_at: datetime


# ─── Model Comparison Schemas ─────────────────────────────────────────────────


class ModelComparisonCreate(BaseSchema):
    """Schema for creating a model comparison."""

    production_version_id: str
    candidate_version_id: str


class ModelComparisonResponse(BaseSchema):
    """Schema for model comparison response."""

    id: str
    production_version_id: str
    candidate_version_id: str
    overall_winner: str
    overall_score_delta: float
    metrics_comparison: list[dict[str, Any]] | None
    per_modality_comparison: list[dict[str, Any]] | None
    false_positive_delta: float | None
    false_negative_delta: float | None
    calibration_delta: float | None
    regression_detected: bool
    regression_details: list[str] | None
    promotion_recommendation: str
    created_by: str | None
    created_at: datetime


# ─── Model Lineage Schemas ────────────────────────────────────────────────────


class ModelLineageEdgeCreate(BaseSchema):
    """Schema for creating a lineage edge."""

    model_id: str
    from_version_id: str
    to_version_id: str
    edge_type: str = Field(
        ...,
        pattern="^(trained_from|promoted_to|rolled_back_to|derived_from)$",
    )
    label: str | None = None
    metadata: dict[str, Any] | None = None


class ModelLineageGraph(BaseSchema):
    """Schema for model lineage graph."""

    model_id: str
    versions: list[dict[str, Any]]
    edges: list[dict[str, Any]]


class ModelLineagePath(BaseSchema):
    """Schema for lineage path from version."""

    version_id: str
    ancestors: list[dict[str, Any]]
    descendants: list[dict[str, Any]]


# ─── Production Inference Schemas ──────────────────────────────────────────────


class ProductionInferenceRequest(BaseSchema):
    """Schema for recording a production inference."""

    request_id: str
    model_id: str
    model_version_id: str
    alias_at_inference: str | None = None
    endpoint: str | None = None
    environment: str | None = None
    latency_ms: float | None = None
    input_hash: str | None = None
    output_summary: dict[str, Any] | None = None


class ProductionInferenceResponse(BaseSchema):
    """Schema for production inference tracking response."""

    id: str
    request_id: str
    model_id: str
    model_version_id: str
    alias_at_inference: str | None
    endpoint: str | None
    environment: str | None
    latency_ms: float | None
    created_at: datetime


# ─── Pipeline Status Schemas ──────────────────────────────────────────────────


class PipelineStatus(BaseSchema):
    """Schema for overall pipeline status."""

    dataset_candidates: int
    pending_approvals: int
    active_training_jobs: int
    completed_training_jobs: int
    failed_training_jobs: int
    models_in_staging: int
    models_in_production: int
    drift_alerts: int
    active_learning_pending: int


class TriggerEvaluation(BaseSchema):
    """Schema for evaluating whether a trigger should fire."""

    trigger_id: str
    should_fire: bool
    reason: str
    new_samples_since_last: int
    threshold: int | None = None
    next_scheduled: datetime | None = None
