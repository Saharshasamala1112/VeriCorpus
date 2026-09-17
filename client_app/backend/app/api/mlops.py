"""
MLOps Pipeline API

Comprehensive API for continuous learning, training management,
model evaluation, promotion, drift monitoring, and active learning.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_permission, require_roles
from app.models.user import User, UserRole
from app.schemas.mlops import (
    ActiveLearningAnnotation,
    ActiveLearningCandidateCreate,
    DatasetCandidateApproval,
    DatasetCandidateCreate,
    DriftSnapshotCreate,
    ExperimentRunComplete,
    ExperimentRunCreate,
    ExperimentRunFail,
    ExperimentRunMetricsUpdate,
    ExperimentRunResponse,
    MLOpsAuditLogResponse,
    ModelAliasAssign,
    ModelComparisonCreate,
    ModelComparisonResponse,
    ModelEvaluationApproval,
    ModelEvaluationCreate,
    ModelEvaluationMetricsUpdate,
    ModelLineageEdgeCreate,
    ModelPromotionCreate,
    ModelRollbackCreate,
    TrainingJobCreate,
    TrainingJobStatusUpdate,
    TrainingTriggerCreate,
    TrainingTriggerUpdate,
)
from app.services.active_learning_service import ActiveLearningService
from app.services.data_pipeline_service import DataPipelineService
from app.services.drift_monitoring_service import DriftMonitoringService
from app.services.experiment_tracking_service import ExperimentTrackingService
from app.services.mlops_audit_service import MLOpsAuditService
from app.services.model_comparison_service import ModelComparisonService
from app.services.model_evaluation_service import ModelEvaluationService
from app.services.model_lineage_service import ModelLineageService
from app.services.model_promotion_service import ModelPromotionService
from app.services.training_trigger_service import TrainingTriggerService

router = APIRouter(prefix="/mlops", tags=["MLOps Pipeline"])


# ─── Dependency Injection ──────────────────────────────────────────────────────


def get_data_pipeline_service(db: AsyncSession = Depends(get_db)) -> DataPipelineService:
    return DataPipelineService(db)


def get_training_trigger_service(db: AsyncSession = Depends(get_db)) -> TrainingTriggerService:
    return TrainingTriggerService(db)


def get_model_evaluation_service(db: AsyncSession = Depends(get_db)) -> ModelEvaluationService:
    return ModelEvaluationService(db)


def get_model_promotion_service(db: AsyncSession = Depends(get_db)) -> ModelPromotionService:
    return ModelPromotionService(db)


def get_drift_monitoring_service(db: AsyncSession = Depends(get_db)) -> DriftMonitoringService:
    return DriftMonitoringService(db)


def get_active_learning_service(db: AsyncSession = Depends(get_db)) -> ActiveLearningService:
    return ActiveLearningService(db)


def get_audit_service(db: AsyncSession = Depends(get_db)) -> MLOpsAuditService:
    return MLOpsAuditService(db)


def get_experiment_tracking_service(db: AsyncSession = Depends(get_db)) -> ExperimentTrackingService:
    return ExperimentTrackingService(db)


def get_model_comparison_service(db: AsyncSession = Depends(get_db)) -> ModelComparisonService:
    return ModelComparisonService(db)


def get_model_lineage_service(db: AsyncSession = Depends(get_db)) -> ModelLineageService:
    return ModelLineageService(db)


# ─── Dataset Candidate Endpoints ──────────────────────────────────────────────


@router.post(
    "/datasets/candidates",
    response_model=DatasetCandidateCreate,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new dataset candidate",
)
async def create_dataset_candidate(
    data: DatasetCandidateCreate,
    current_user: Annotated[User, Depends(require_permission("approve_training_data"))],
    service: DataPipelineService = Depends(get_data_pipeline_service),
    audit: MLOpsAuditService = Depends(get_audit_service),
):
    """Create a new dataset candidate for validation and approval."""
    candidate = await service.create_candidate(data, current_user.id)
    await audit.log_dataset_created(
        candidate.id,
        current_user.id,
        {"name": data.name, "media_type": data.media_type},
    )
    await audit.commit()
    return candidate


@router.get(
    "/datasets/candidates",
    response_model=list[DatasetCandidateCreate],
    summary="List dataset candidates",
)
async def list_dataset_candidates(
    status_filter: str | None = Query(None, alias="status"),
    media_type: str | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    service: DataPipelineService = Depends(get_data_pipeline_service),
):
    """List dataset candidates with optional filters."""
    return await service.list_candidates(
        status=status_filter,
        media_type=media_type,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/datasets/candidates/{candidate_id}",
    response_model=DatasetCandidateCreate,
    summary="Get dataset candidate details",
)
async def get_dataset_candidate(
    candidate_id: str,
    service: DataPipelineService = Depends(get_data_pipeline_service),
):
    """Get detailed information about a dataset candidate."""
    candidate = await service.get_candidate(candidate_id)
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset candidate {candidate_id} not found",
        )
    return candidate


@router.post(
    "/datasets/candidates/{candidate_id}/approve",
    response_model=DatasetCandidateApproval,
    summary="Approve or reject a dataset candidate",
)
async def approve_dataset_candidate(
    candidate_id: str,
    approval: DatasetCandidateApproval,
    current_user: Annotated[User, Depends(require_permission("approve_training_data"))],
    service: DataPipelineService = Depends(get_data_pipeline_service),
    audit: MLOpsAuditService = Depends(get_audit_service),
):
    """Approve or reject a dataset candidate."""
    try:
        candidate = await service.approve_candidate(candidate_id, approval, current_user.id)
        await audit.log_dataset_approved(
            candidate_id,
            current_user.id,
            approval.approved,
            approval.rejection_reason,
        )
        await audit.commit()
        return candidate
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get(
    "/datasets/candidates/{candidate_id}/quality-checks",
    response_model=list[DatasetCandidateCreate],
    summary="Get quality checks for a dataset candidate",
)
async def get_quality_checks(
    candidate_id: str,
    service: DataPipelineService = Depends(get_data_pipeline_service),
):
    """Get quality check results for a dataset candidate."""
    return await service.get_quality_checks(candidate_id)


@router.get(
    "/datasets/pending-count",
    response_model=int,
    summary="Get count of pending dataset approvals",
)
async def get_pending_dataset_count(
    service: DataPipelineService = Depends(get_data_pipeline_service),
):
    """Get the count of dataset candidates pending approval."""
    return await service.get_pending_count()


# ─── Training Trigger Endpoints ───────────────────────────────────────────────


@router.post(
    "/triggers",
    response_model=TrainingTriggerCreate,
    status_code=status.HTTP_201_CREATED,
    summary="Create a training trigger",
)
async def create_training_trigger(
    data: TrainingTriggerCreate,
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ML_ENGINEER))],
    service: TrainingTriggerService = Depends(get_training_trigger_service),
):
    """Create a new training trigger."""
    return await service.create_trigger(data, current_user.id)


@router.get(
    "/triggers",
    response_model=list[TrainingTriggerCreate],
    summary="List training triggers",
)
async def list_training_triggers(
    active_only: bool = False,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    service: TrainingTriggerService = Depends(get_training_trigger_service),
):
    """List training triggers."""
    return await service.list_triggers(
        active_only=active_only,
        limit=limit,
        offset=offset,
    )


@router.put(
    "/triggers/{trigger_id}",
    response_model=TrainingTriggerUpdate,
    summary="Update a training trigger",
)
async def update_training_trigger(
    trigger_id: str,
    data: TrainingTriggerUpdate,
    service: TrainingTriggerService = Depends(get_training_trigger_service),
):
    """Update a training trigger."""
    try:
        return await service.update_trigger(trigger_id, data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.post(
    "/triggers/{trigger_id}/evaluate",
    response_model=dict[str, Any],
    summary="Evaluate if a trigger should fire",
)
async def evaluate_training_trigger(
    trigger_id: str,
    new_samples_count: int = Query(..., ge=0),
    service: TrainingTriggerService = Depends(get_training_trigger_service),
):
    """Evaluate whether a trigger should fire based on current conditions."""
    try:
        evaluation = await service.evaluate_trigger(trigger_id, new_samples_count)
        return evaluation.model_dump()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


# ─── Training Job Endpoints ───────────────────────────────────────────────────


@router.post(
    "/jobs",
    response_model=TrainingJobCreate,
    status_code=status.HTTP_201_CREATED,
    summary="Create a training job",
)
async def create_training_job(
    data: TrainingJobCreate,
    current_user: Annotated[User, Depends(require_permission("start_training"))],
    service: TrainingTriggerService = Depends(get_training_trigger_service),
    audit: MLOpsAuditService = Depends(get_audit_service),
):
    """Create a new training job."""
    try:
        job = await service.create_job(data, current_user.id)
        await audit.log_training_initiated(
            job.id,
            current_user.id,
            data.model_id,
            data.dataset_candidate_id,
            data.trigger_id,
        )
        await audit.commit()
        return job
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get(
    "/jobs",
    response_model=list[TrainingJobCreate],
    summary="List training jobs",
)
async def list_training_jobs(
    status_filter: str | None = Query(None, alias="status"),
    model_id: str | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    service: TrainingTriggerService = Depends(get_training_trigger_service),
):
    """List training jobs with optional filters."""
    return await service.list_jobs(
        status=status_filter,
        model_id=model_id,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/jobs/{job_id}",
    response_model=TrainingJobCreate,
    summary="Get training job details",
)
async def get_training_job(
    job_id: str,
    service: TrainingTriggerService = Depends(get_training_trigger_service),
):
    """Get detailed information about a training job."""
    job = await service.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Training job {job_id} not found",
        )
    return job


@router.put(
    "/jobs/{job_id}/status",
    response_model=TrainingJobStatusUpdate,
    summary="Update training job status",
)
async def update_training_job_status(
    job_id: str,
    data: TrainingJobStatusUpdate,
    service: TrainingTriggerService = Depends(get_training_trigger_service),
):
    """Update training job status with transition validation."""
    try:
        return await service.update_job_status(job_id, data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post(
    "/jobs/{job_id}/cancel",
    response_model=TrainingJobCreate,
    summary="Cancel a training job",
)
async def cancel_training_job(
    job_id: str,
    service: TrainingTriggerService = Depends(get_training_trigger_service),
):
    """Cancel a training job."""
    try:
        return await service.cancel_job(job_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get(
    "/jobs/counts",
    response_model=dict[str, int],
    summary="Get training job counts by status",
)
async def get_training_job_counts(
    service: TrainingTriggerService = Depends(get_training_trigger_service),
):
    """Get counts of training jobs grouped by status."""
    return await service.get_job_counts()


# ─── Model Evaluation Endpoints ───────────────────────────────────────────────


@router.post(
    "/evaluations",
    response_model=ModelEvaluationCreate,
    status_code=status.HTTP_201_CREATED,
    summary="Create a model evaluation",
)
async def create_model_evaluation(
    data: ModelEvaluationCreate,
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ML_ENGINEER))],
    service: ModelEvaluationService = Depends(get_model_evaluation_service),
):
    """Create a new model evaluation."""
    try:
        return await service.create_evaluation(data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get(
    "/evaluations",
    response_model=list[ModelEvaluationCreate],
    summary="List model evaluations",
)
async def list_model_evaluations(
    training_job_id: str | None = None,
    approval_status: str | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    service: ModelEvaluationService = Depends(get_model_evaluation_service),
):
    """List model evaluations with optional filters."""
    return await service.list_evaluations(
        training_job_id=training_job_id,
        approval_status=approval_status,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/evaluations/{evaluation_id}",
    response_model=ModelEvaluationCreate,
    summary="Get model evaluation details",
)
async def get_model_evaluation(
    evaluation_id: str,
    service: ModelEvaluationService = Depends(get_model_evaluation_service),
):
    """Get detailed information about a model evaluation."""
    evaluation = await service.get_evaluation(evaluation_id)
    if not evaluation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model evaluation {evaluation_id} not found",
        )
    return evaluation


@router.put(
    "/evaluations/{evaluation_id}/metrics",
    response_model=ModelEvaluationMetricsUpdate,
    summary="Update evaluation metrics",
)
async def update_evaluation_metrics(
    evaluation_id: str,
    data: ModelEvaluationMetricsUpdate,
    service: ModelEvaluationService = Depends(get_model_evaluation_service),
):
    """Update evaluation metrics."""
    try:
        return await service.update_metrics(evaluation_id, data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.get(
    "/evaluations/{evaluation_id}/compare",
    response_model=dict[str, Any],
    summary="Compare candidate with production model",
)
async def compare_with_production(
    evaluation_id: str,
    service: ModelEvaluationService = Depends(get_model_evaluation_service),
):
    """Compare candidate model with production model."""
    try:
        return await service.compare_with_production(evaluation_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.post(
    "/evaluations/{evaluation_id}/approve",
    response_model=ModelEvaluationApproval,
    summary="Approve or reject a model evaluation",
)
async def approve_model_evaluation(
    evaluation_id: str,
    approval: ModelEvaluationApproval,
    current_user: Annotated[User, Depends(require_permission("approve_training_data"))],
    service: ModelEvaluationService = Depends(get_model_evaluation_service),
    audit: MLOpsAuditService = Depends(get_audit_service),
):
    """Approve or reject a model evaluation."""
    try:
        evaluation = await service.approve_evaluation(evaluation_id, approval, current_user.id)
        await audit.log_model_evaluated(
            evaluation_id,
            current_user.id,
            evaluation.model_version_id,
            approval.approved,
        )
        await audit.commit()
        return evaluation
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get(
    "/evaluations/pending-count",
    response_model=int,
    summary="Get count of pending evaluations",
)
async def get_pending_evaluation_count(
    service: ModelEvaluationService = Depends(get_model_evaluation_service),
):
    """Get the count of model evaluations pending approval."""
    return await service.get_pending_count()


# ─── Model Promotion Endpoints ────────────────────────────────────────────────


@router.post(
    "/promotions",
    response_model=ModelPromotionCreate,
    status_code=status.HTTP_201_CREATED,
    summary="Promote a model version",
)
async def promote_model(
    data: ModelPromotionCreate,
    current_user: Annotated[User, Depends(require_permission("promote_models"))],
    service: ModelPromotionService = Depends(get_model_promotion_service),
    audit: MLOpsAuditService = Depends(get_audit_service),
):
    """Promote a model version to the next stage."""
    try:
        promotion = await service.promote_model(data, current_user.id)
        await audit.log_model_promoted(
            promotion.id,
            current_user.id,
            data.model_id,
            promotion.from_version_id,
            data.to_version_id,
            promotion.from_stage,
            promotion.to_stage,
        )
        await audit.commit()
        return promotion
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post(
    "/promotions/{model_id}/to-production/{version_id}",
    response_model=ModelPromotionCreate,
    summary="Promote model directly to production",
)
async def promote_to_production(
    model_id: str,
    version_id: str,
    current_user: Annotated[User, Depends(require_permission("promote_models"))],
    service: ModelPromotionService = Depends(get_model_promotion_service),
    audit: MLOpsAuditService = Depends(get_audit_service),
    reason: str | None = None,
):
    """Directly promote a model version to production."""
    try:
        promotion = await service.promote_to_production(model_id, version_id, current_user.id, reason)
        await audit.log_model_promoted(
            promotion.id,
            current_user.id,
            model_id,
            promotion.from_version_id,
            version_id,
            promotion.from_stage,
            promotion.to_stage,
        )
        await audit.commit()
        return promotion
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post(
    "/rollbacks",
    response_model=ModelRollbackCreate,
    status_code=status.HTTP_201_CREATED,
    summary="Rollback to a previous model version",
)
async def rollback_model(
    data: ModelRollbackCreate,
    current_user: Annotated[User, Depends(require_permission("rollback_models"))],
    service: ModelPromotionService = Depends(get_model_promotion_service),
    audit: MLOpsAuditService = Depends(get_audit_service),
):
    """Rollback to a previous model version."""
    try:
        promotion = await service.rollback_model(data, current_user.id)
        await audit.log_model_rolled_back(
            promotion.id,
            current_user.id,
            data.model_id,
            promotion.from_version_id or "",
            data.target_version_id,
            data.reason,
        )
        await audit.commit()
        return promotion
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get(
    "/models/{model_id}/versions",
    response_model=list[ModelPromotionCreate],
    summary="Get all versions of a model",
)
async def get_model_versions(
    model_id: str,
    status_filter: str | None = Query(None, alias="status"),
    service: ModelPromotionService = Depends(get_model_promotion_service),
):
    """Get all versions of a model."""
    return await service.get_model_versions(model_id, status_filter)


@router.get(
    "/models/{model_id}/production-version",
    response_model=ModelPromotionCreate,
    summary="Get current production version",
)
async def get_production_version(
    model_id: str,
    service: ModelPromotionService = Depends(get_model_promotion_service),
):
    """Get the current production version of a model."""
    version = await service.get_production_version(model_id)
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No production version found for model {model_id}",
        )
    return version


@router.get(
    "/models/{model_id}/promotion-history",
    response_model=list[ModelPromotionCreate],
    summary="Get promotion/rollback history",
)
async def get_promotion_history(
    model_id: str,
    limit: int = Query(20, ge=1, le=100),
    service: ModelPromotionService = Depends(get_model_promotion_service),
):
    """Get promotion/rollback history for a model."""
    return await service.get_promotion_history(model_id, limit)


# ─── Drift Monitoring Endpoints ───────────────────────────────────────────────


@router.post(
    "/drift/snapshots",
    response_model=DriftSnapshotCreate,
    status_code=status.HTTP_201_CREATED,
    summary="Create a drift snapshot",
)
async def create_drift_snapshot(
    data: DriftSnapshotCreate,
    service: DriftMonitoringService = Depends(get_drift_monitoring_service),
):
    """Create a drift snapshot and calculate drift score."""
    return await service.create_snapshot(data)


@router.get(
    "/drift/snapshots/{model_id}",
    response_model=list[DriftSnapshotCreate],
    summary="Get drift snapshots for a model",
)
async def get_drift_snapshots(
    model_id: str,
    metric_type: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    service: DriftMonitoringService = Depends(get_drift_monitoring_service),
):
    """Get drift snapshots for a model."""
    return await service.get_snapshots(model_id, metric_type, limit, offset)


@router.get(
    "/drift/alerts/{model_id}",
    response_model=list[DriftSnapshotCreate],
    summary="Get drift alerts for a model",
)
async def get_drift_alerts(
    model_id: str,
    service: DriftMonitoringService = Depends(get_drift_monitoring_service),
):
    """Get drift alerts for a model."""
    return await service.detect_drift(model_id)


@router.get(
    "/drift/summary/{model_id}",
    response_model=dict[str, Any],
    summary="Get drift summary for a model",
)
async def get_drift_summary(
    model_id: str,
    service: DriftMonitoringService = Depends(get_drift_monitoring_service),
):
    """Get a summary of drift status for a model."""
    return await service.get_drift_summary(model_id)


@router.post(
    "/drift/baselines",
    response_model=DriftSnapshotCreate,
    status_code=status.HTTP_201_CREATED,
    summary="Set a baseline value for drift monitoring",
)
async def set_drift_baseline(
    model_id: str,
    metric_type: str,
    metric_name: str,
    baseline_value: float,
    service: DriftMonitoringService = Depends(get_drift_monitoring_service),
):
    """Set a baseline value for drift monitoring."""
    return await service.set_baseline(model_id, metric_type, metric_name, baseline_value)


# ─── Active Learning Endpoints ────────────────────────────────────────────────


@router.post(
    "/active-learning/candidates",
    response_model=ActiveLearningCandidateCreate,
    status_code=status.HTTP_201_CREATED,
    summary="Create an active learning candidate",
)
async def create_active_learning_candidate(
    data: ActiveLearningCandidateCreate,
    service: ActiveLearningService = Depends(get_active_learning_service),
):
    """Create a new active learning candidate."""
    return await service.create_candidate(data)


@router.post(
    "/active-learning/candidates/batch",
    response_model=list[ActiveLearningCandidateCreate],
    status_code=status.HTTP_201_CREATED,
    summary="Create multiple active learning candidates",
)
async def create_active_learning_candidates_batch(
    candidates: list[ActiveLearningCandidateCreate],
    service: ActiveLearningService = Depends(get_active_learning_service),
):
    """Create multiple active learning candidates."""
    return await service.create_candidates_batch(candidates)


@router.get(
    "/active-learning/candidates",
    response_model=list[ActiveLearningCandidateCreate],
    summary="List active learning candidates",
)
async def list_active_learning_candidates(
    status_filter: str | None = Query(None, alias="status"),
    selection_reason: str | None = None,
    media_type: str | None = None,
    min_priority: int | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    service: ActiveLearningService = Depends(get_active_learning_service),
):
    """List active learning candidates with filters."""
    return await service.list_candidates(
        status=status_filter,
        selection_reason=selection_reason,
        media_type=media_type,
        min_priority=min_priority,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/active-learning/candidates/{candidate_id}",
    response_model=ActiveLearningCandidateCreate,
    summary="Get active learning candidate details",
)
async def get_active_learning_candidate(
    candidate_id: str,
    service: ActiveLearningService = Depends(get_active_learning_service),
):
    """Get detailed information about an active learning candidate."""
    candidate = await service.get_candidate(candidate_id)
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Active learning candidate {candidate_id} not found",
        )
    return candidate


@router.post(
    "/active-learning/candidates/{candidate_id}/annotate",
    response_model=ActiveLearningAnnotation,
    summary="Annotate an active learning candidate",
)
async def annotate_active_learning_candidate(
    candidate_id: str,
    annotation: ActiveLearningAnnotation,
    current_user: User = Depends(get_current_user),
    service: ActiveLearningService = Depends(get_active_learning_service),
    audit: MLOpsAuditService = Depends(get_audit_service),
):
    """Annotate an active learning candidate."""
    try:
        candidate = await service.annotate_candidate(candidate_id, annotation, current_user.id)
        await audit.log_annotation_added(
            candidate_id,
            current_user.id,
            {"label": annotation.label, "confidence": annotation.confidence},
        )
        await audit.commit()
        return candidate
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post(
    "/active-learning/candidates/{candidate_id}/skip",
    response_model=ActiveLearningCandidateCreate,
    summary="Skip an active learning candidate",
)
async def skip_active_learning_candidate(
    candidate_id: str,
    reason: str | None = None,
    service: ActiveLearningService = Depends(get_active_learning_service),
):
    """Skip an active learning candidate."""
    try:
        return await service.skip_candidate(candidate_id, reason)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get(
    "/active-learning/low-confidence",
    response_model=list[ActiveLearningCandidateCreate],
    summary="Get low-confidence samples",
)
async def get_low_confidence_samples(
    threshold: float = Query(0.5, ge=0.0, le=1.0),
    limit: int = Query(20, ge=1, le=100),
    service: ActiveLearningService = Depends(get_active_learning_service),
):
    """Get samples with confidence below threshold."""
    return await service.get_low_confidence_samples(threshold, limit)


@router.get(
    "/active-learning/disagreement",
    response_model=list[ActiveLearningCandidateCreate],
    summary="Get disagreement samples",
)
async def get_disagreement_samples(
    min_disagreement: float = Query(0.3, ge=0.0, le=1.0),
    limit: int = Query(20, ge=1, le=100),
    service: ActiveLearningService = Depends(get_active_learning_service),
):
    """Get samples with high disagreement scores."""
    return await service.get_disagreement_samples(min_disagreement, limit)


@router.get(
    "/active-learning/priority",
    response_model=list[ActiveLearningCandidateCreate],
    summary="Get priority samples for annotation",
)
async def get_priority_samples(
    limit: int = Query(20, ge=1, le=100),
    service: ActiveLearningService = Depends(get_active_learning_service),
):
    """Get highest priority samples for annotation."""
    return await service.get_priority_samples(limit)


@router.get(
    "/active-learning/statistics",
    response_model=dict[str, Any],
    summary="Get active learning statistics",
)
async def get_active_learning_statistics(
    service: ActiveLearningService = Depends(get_active_learning_service),
):
    """Get statistics about active learning candidates."""
    return await service.get_statistics()


# ─── Audit Log Endpoints ──────────────────────────────────────────────────────


@router.get(
    "/audit/logs",
    response_model=list[MLOpsAuditLogResponse],
    summary="Get audit logs",
)
async def get_audit_logs(
    action: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    user_id: str | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    service: MLOpsAuditService = Depends(get_audit_service),
):
    """Get audit logs with filters."""
    return await service.get_logs(
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        user_id=user_id,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/audit/history/{resource_type}/{resource_id}",
    response_model=list[MLOpsAuditLogResponse],
    summary="Get audit history for a resource",
)
async def get_resource_audit_history(
    resource_type: str,
    resource_id: str,
    service: MLOpsAuditService = Depends(get_audit_service),
):
    """Get audit history for a specific resource."""
    return await service.get_resource_history(resource_type, resource_id)


@router.get(
    "/audit/statistics",
    response_model=dict[str, Any],
    summary="Get audit statistics",
)
async def get_audit_statistics(
    days: int = Query(30, ge=1, le=365),
    service: MLOpsAuditService = Depends(get_audit_service),
):
    """Get audit log statistics."""
    return await service.get_statistics(days)


# ─── Pipeline Status Endpoint ─────────────────────────────────────────────────


@router.get(
    "/pipeline/status",
    response_model=dict[str, Any],
    summary="Get overall pipeline status",
)
async def get_pipeline_status(
    data_pipeline: DataPipelineService = Depends(get_data_pipeline_service),
    training: TrainingTriggerService = Depends(get_training_trigger_service),
    evaluation: ModelEvaluationService = Depends(get_model_evaluation_service),
    drift: DriftMonitoringService = Depends(get_drift_monitoring_service),
    active_learning: ActiveLearningService = Depends(get_active_learning_service),
):
    """Get overall status of the MLOps pipeline."""
    return {
        "dataset_candidates": await data_pipeline.get_pending_count(),
        "pending_approvals": await data_pipeline.get_pending_count(),
        "active_training_jobs": len(await training.list_jobs(status="running", limit=100)),
        "completed_training_jobs": len(await training.list_jobs(status="succeeded", limit=100)),
        "failed_training_jobs": len(await training.list_jobs(status="failed", limit=100)),
        "models_in_staging": 0,  # Would need additional query
        "models_in_production": 0,  # Would need additional query
        "drift_alerts": 0,  # Would need model_id
        "active_learning_pending": (await active_learning.get_statistics()).get("by_status", {}).get("pending", 0),
    }


# ─── Experiment Tracking Endpoints ─────────────────────────────────────────


@router.post(
    "/experiments/runs",
    response_model=ExperimentRunResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an experiment run",
)
async def create_experiment_run(
    data: ExperimentRunCreate,
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ML_ENGINEER))],
    service: ExperimentTrackingService = Depends(get_experiment_tracking_service),
    audit: MLOpsAuditService = Depends(get_audit_service),
):
    """Create a new experiment run for tracking ML experiments."""
    run = await service.create_experiment_run(data, created_by=current_user.id)
    await audit.log_experiment_run_created(run.id, data.experiment_name, current_user.id, data.run_id)
    await audit.commit()
    return run


@router.post(
    "/experiments/runs/{run_id}/complete",
    response_model=ExperimentRunResponse,
    summary="Mark experiment run as completed",
)
async def complete_experiment_run(
    run_id: str,
    data: ExperimentRunComplete,
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ML_ENGINEER))],
    service: ExperimentTrackingService = Depends(get_experiment_tracking_service),
    audit: MLOpsAuditService = Depends(get_audit_service),
):
    """Mark an experiment run as completed with final metrics."""
    run = await service.complete_run(run_id, data.metrics, data.artifacts)
    await audit.log_experiment_run_completed(run_id, current_user.id, data.metrics)
    await audit.commit()
    return run


@router.post(
    "/experiments/runs/{run_id}/fail",
    response_model=ExperimentRunResponse,
    summary="Mark experiment run as failed",
)
async def fail_experiment_run(
    run_id: str,
    data: ExperimentRunFail,
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ML_ENGINEER))],
    service: ExperimentTrackingService = Depends(get_experiment_tracking_service),
):
    """Mark an experiment run as failed with error message."""
    return await service.fail_run(run_id, data.error_message)


@router.put(
    "/experiments/runs/{run_id}/metrics",
    response_model=ExperimentRunResponse,
    summary="Update experiment run metrics",
)
async def update_experiment_run_metrics(
    run_id: str,
    data: ExperimentRunMetricsUpdate,
    service: ExperimentTrackingService = Depends(get_experiment_tracking_service),
):
    """Update metrics for an in-progress experiment run."""
    return await service.log_metrics(run_id, data.metrics)


@router.get(
    "/experiments/runs/{run_id}",
    response_model=ExperimentRunResponse,
    summary="Get experiment run details",
)
async def get_experiment_run(
    run_id: str,
    service: ExperimentTrackingService = Depends(get_experiment_tracking_service),
):
    """Get details of a specific experiment run."""
    return await service.get_run(run_id)


@router.get(
    "/experiments/runs",
    response_model=list[ExperimentRunResponse],
    summary="List experiment runs",
)
async def list_experiment_runs(
    experiment_name: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    service: ExperimentTrackingService = Depends(get_experiment_tracking_service),
):
    """List experiment runs with optional filters."""
    return await service.list_runs(experiment_name=experiment_name, status=status_filter, limit=limit, offset=offset)


# ─── Model Alias Endpoints ─────────────────────────────────────────────────


@router.post(
    "/aliases/{model_id}/{version_id}",
    response_model=dict[str, str],
    status_code=status.HTTP_201_CREATED,
    summary="Assign an alias to a model version",
)
async def assign_model_alias(
    model_id: str,
    version_id: str,
    data: ModelAliasAssign,
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ML_ENGINEER))],
    service: ModelPromotionService = Depends(get_model_promotion_service),
    audit: MLOpsAuditService = Depends(get_audit_service),
):
    """Assign an alias (e.g. 'production', 'champion') to a model version."""
    alias = await service.assign_alias(model_id, version_id, data.alias, current_user.id)
    await audit.log_model_alias_assigned(version_id, current_user.id, data.alias)
    await audit.commit()
    return {"alias": alias.alias, "version_id": version_id}


@router.get(
    "/aliases/{model_id}",
    response_model=list[dict[str, str]],
    summary="List model aliases",
)
async def list_model_aliases(
    model_id: str,
    service: ModelPromotionService = Depends(get_model_promotion_service),
):
    """List all model version aliases for a specific model."""
    versions = await service.get_model_versions(model_id)
    aliases = []
    for v in versions:
        alias_obj = await service.get_alias_version(model_id, v.version)
        if alias_obj:
            aliases.append({"version_id": v.id, "version": v.version})
    return aliases


# ─── Model Comparison Endpoints ───────────────────────────────────────────


@router.post(
    "/comparisons",
    response_model=ModelComparisonResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a model comparison",
)
async def create_model_comparison(
    data: ModelComparisonCreate,
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ML_ENGINEER))],
    service: ModelComparisonService = Depends(get_model_comparison_service),
    audit: MLOpsAuditService = Depends(get_audit_service),
):
    """Create a head-to-head comparison between candidate and production models."""
    comparison = await service.compare_versions(
        data.production_version_id,
        data.candidate_version_id,
        created_by=current_user.id,
    )
    await audit.log_model_comparison_created(
        comparison.id, current_user.id, [data.production_version_id, data.candidate_version_id]
    )
    await audit.commit()
    return comparison


@router.get(
    "/comparisons/{comparison_id}",
    response_model=ModelComparisonResponse,
    summary="Get model comparison details",
)
async def get_model_comparison(
    comparison_id: str,
    service: ModelComparisonService = Depends(get_model_comparison_service),
):
    """Get details of a specific model comparison."""
    return await service.get_comparison(comparison_id)


@router.get(
    "/comparisons",
    response_model=list[ModelComparisonResponse],
    summary="List model comparisons",
)
async def list_model_comparisons(
    candidate_version_id: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    service: ModelComparisonService = Depends(get_model_comparison_service),
):
    """List model comparisons with optional filters."""
    return await service.list_comparisons(candidate_version_id=candidate_version_id, limit=limit, offset=offset)


# ─── Model Lineage Endpoints ──────────────────────────────────────────────


@router.post(
    "/lineage/edges",
    response_model=dict[str, str],
    status_code=status.HTTP_201_CREATED,
    summary="Create a lineage edge",
)
async def create_lineage_edge(
    data: ModelLineageEdgeCreate,
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ML_ENGINEER))],
    service: ModelLineageService = Depends(get_model_lineage_service),
    audit: MLOpsAuditService = Depends(get_audit_service),
):
    """Create a directed edge in the model lineage graph."""
    edge = await service.add_edge(
        data.model_id,
        data.from_version_id,
        data.to_version_id,
        data.edge_type,
        data.label,
        data.metadata,
    )
    await audit.log_lineage_edge_created(data.from_version_id, data.to_version_id, current_user.id, data.edge_type)
    await audit.commit()
    return {"id": edge.id, "edge_type": edge.edge_type}


@router.get(
    "/lineage/graph/{model_id}",
    response_model=dict[str, Any],
    summary="Get model lineage graph",
)
async def get_model_lineage_graph(
    model_id: str,
    service: ModelLineageService = Depends(get_model_lineage_service),
):
    """Get the full lineage graph for a model."""
    return await service.get_lineage(model_id)


@router.get(
    "/lineage/path/{from_version_id}/{to_version_id}",
    response_model=dict[str, Any],
    summary="Find path between model versions",
)
async def get_lineage_path(
    from_version_id: str,
    to_version_id: str,
    service: ModelLineageService = Depends(get_model_lineage_service),
):
    """Find the path between two model versions in the lineage graph."""
    return await service.get_version_lineage(from_version_id)
