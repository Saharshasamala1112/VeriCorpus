"""
Model Evaluation Service

Handles model evaluation, comparison against production, and approval workflows.
Implements the safety measure: never promote a model only because training completed.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.all_models import ModelVersion
from app.models.mlops import (
    ApprovalStatus,
    ModelEvaluation,
    ModelStage,
    TrainingJobV2,
)
from app.schemas.mlops import (
    ModelEvaluationApproval,
    ModelEvaluationCreate,
    ModelEvaluationMetricsUpdate,
)


class ModelEvaluationService:
    """Service for model evaluation and comparison."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Evaluation Management ─────────────────────────────────────────────

    async def create_evaluation(
        self,
        data: ModelEvaluationCreate,
    ) -> ModelEvaluation:
        """Create a new model evaluation."""
        # Validate training job exists
        job = await self._get_training_job(data.training_job_id)
        if not job:
            raise ValueError(f"Training job {data.training_job_id} not found")

        # Validate model version exists
        model_version = await self._get_model_version(data.model_version_id)
        if not model_version:
            raise ValueError(f"Model version {data.model_version_id} not found")

        # Get production model version for comparison
        production_version_id = data.production_model_version_id
        if not production_version_id:
            production_version_id = await self._get_production_model_version(model_version.model_id)

        evaluation = ModelEvaluation(
            training_job_id=data.training_job_id,
            model_version_id=data.model_version_id,
            production_model_version_id=production_version_id,
            approval_status=ApprovalStatus.PENDING.value,
            threshold_config=json.dumps(
                {
                    "min_precision": 0.7,
                    "min_recall": 0.7,
                    "min_f1": 0.7,
                    "max_regression": 0.05,
                }
            ),
        )
        self.db.add(evaluation)
        await self.db.commit()
        await self.db.refresh(evaluation)
        return evaluation

    async def get_evaluation(self, evaluation_id: str) -> ModelEvaluation | None:
        """Get a model evaluation by ID."""
        query = (
            select(ModelEvaluation)
            .options(
                selectinload(ModelEvaluation.training_job),
                selectinload(ModelEvaluation.model_version),
                selectinload(ModelEvaluation.production_model_version),
            )
            .where(ModelEvaluation.id == evaluation_id)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_evaluations(
        self,
        training_job_id: str | None = None,
        approval_status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ModelEvaluation]:
        """List model evaluations with optional filters."""
        query = select(ModelEvaluation).options(
            selectinload(ModelEvaluation.training_job),
            selectinload(ModelEvaluation.model_version),
        )
        if training_job_id:
            query = query.where(ModelEvaluation.training_job_id == training_job_id)
        if approval_status:
            query = query.where(ModelEvaluation.approval_status == approval_status)
        query = query.order_by(ModelEvaluation.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ─── Metrics Update ────────────────────────────────────────────────────

    async def update_metrics(
        self,
        evaluation_id: str,
        data: ModelEvaluationMetricsUpdate,
    ) -> ModelEvaluation:
        """Update evaluation metrics."""
        evaluation = await self.get_evaluation(evaluation_id)
        if not evaluation:
            raise ValueError(f"Model evaluation {evaluation_id} not found")

        if data.training_metrics is not None:
            evaluation.training_metrics = json.dumps(data.training_metrics)
        if data.validation_metrics is not None:
            evaluation.validation_metrics = json.dumps(data.validation_metrics)
        if data.test_metrics is not None:
            evaluation.test_metrics = json.dumps(data.test_metrics)
        if data.production_metrics is not None:
            evaluation.production_metrics = json.dumps(data.production_metrics)
        if data.improvement_over_production is not None:
            evaluation.improvement_over_production = json.dumps(data.improvement_over_production)
        if data.meets_thresholds is not None:
            evaluation.meets_thresholds = data.meets_thresholds

        await self.db.commit()
        await self.db.refresh(evaluation)
        return evaluation

    # ─── Comparison Logic ──────────────────────────────────────────────────

    async def compare_with_production(
        self,
        evaluation_id: str,
    ) -> dict[str, Any]:
        """Compare candidate model with production model."""
        evaluation = await self.get_evaluation(evaluation_id)
        if not evaluation:
            raise ValueError(f"Model evaluation {evaluation_id} not found")

        candidate_metrics = json.loads(evaluation.test_metrics or "{}")
        production_metrics = json.loads(evaluation.production_metrics or "{}")

        comparison = {
            "candidate": candidate_metrics,
            "production": production_metrics,
            "improvement": {},
            "meets_thresholds": False,
            "recommendation": "",
        }

        if not candidate_metrics or not production_metrics:
            comparison["recommendation"] = "Insufficient data for comparison"
            return comparison

        # Calculate improvement for each metric
        for metric in ["precision", "recall", "f1_score", "auroc"]:
            if metric in candidate_metrics and metric in production_metrics:
                candidate_val = candidate_metrics[metric]
                production_val = production_metrics[metric]
                if production_val > 0:
                    improvement = (candidate_val - production_val) / production_val
                    comparison["improvement"][metric] = {
                        "candidate": candidate_val,
                        "production": production_val,
                        "improvement_pct": round(improvement * 100, 2),
                    }

        # Check thresholds
        threshold_config = json.loads(evaluation.threshold_config or "{}")
        meets_all = True
        for metric, threshold in threshold_config.items():
            if metric.startswith("min_"):
                metric_name = metric[4:]
                if metric_name in candidate_metrics:
                    if candidate_metrics[metric_name] < threshold:
                        meets_all = False
                        comparison["improvement"][metric_name] = {
                            **comparison["improvement"].get(metric_name, {}),
                            "below_threshold": True,
                            "threshold": threshold,
                        }

        comparison["meets_thresholds"] = meets_all
        evaluation.meets_thresholds = meets_all
        await self.db.commit()

        # Generate recommendation
        if meets_all:
            if comparison["improvement"].get("f1_score", {}).get("improvement_pct", 0) > 0:
                comparison["recommendation"] = (
                    "Model shows improvement over production and meets all thresholds. Recommend promotion to staging."
                )
            else:
                comparison["recommendation"] = (
                    "Model meets thresholds but shows no significant improvement. Consider additional evaluation."
                )
        else:
            comparison["recommendation"] = (
                "Model does not meet required thresholds. Recommend further training or hyperparameter tuning."
            )

        return comparison

    # ─── Approval Workflow ─────────────────────────────────────────────────

    async def approve_evaluation(
        self,
        evaluation_id: str,
        approval: ModelEvaluationApproval,
        reviewer_id: str,
    ) -> ModelEvaluation:
        """Approve or reject a model evaluation."""
        evaluation = await self.get_evaluation(evaluation_id)
        if not evaluation:
            raise ValueError(f"Model evaluation {evaluation_id} not found")

        if evaluation.approval_status != ApprovalStatus.PENDING.value:
            raise ValueError(f"Evaluation is not pending approval (status: {evaluation.approval_status})")

        now = datetime.now(UTC)
        if approval.approved:
            evaluation.approval_status = ApprovalStatus.APPROVED.value
        else:
            evaluation.approval_status = ApprovalStatus.REJECTED.value

        evaluation.reviewed_by = reviewer_id
        evaluation.reviewed_at = now
        evaluation.review_notes = approval.review_notes

        await self.db.commit()
        await self.db.refresh(evaluation)
        return evaluation

    async def get_pending_count(self) -> int:
        """Get count of pending evaluations."""
        query = select(ModelEvaluation).where(ModelEvaluation.approval_status == ApprovalStatus.PENDING.value)
        result = await self.db.execute(query)
        return len(list(result.scalars().all()))

    # ─── Helper Methods ────────────────────────────────────────────────────

    async def _get_training_job(self, job_id: str) -> TrainingJobV2 | None:
        """Get a training job by ID."""
        query = select(TrainingJobV2).where(TrainingJobV2.id == job_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_model_version(self, version_id: str) -> ModelVersion | None:
        """Get a model version by ID."""
        query = select(ModelVersion).where(ModelVersion.id == version_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_production_model_version(self, model_id: str) -> str | None:
        """Get the current production model version ID."""
        query = (
            select(ModelVersion)
            .where(
                ModelVersion.model_id == model_id,
                ModelVersion.status == ModelStage.PRODUCTION.value,
            )
            .limit(1)
        )
        result = await self.db.execute(query)
        version = result.scalar_one_or_none()
        return version.id if version else None
