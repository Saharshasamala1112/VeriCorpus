"""
MLOps Audit Logging Service

Comprehensive audit logging for all MLOps operations including:
- Dataset creation, approval
- Training initiation
- Model evaluation
- Model promotion, rollback
- Drift detection
- Annotation activities
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mlops import MLOpsAuditLog


class MLOpsAuditService:
    """Service for MLOps audit logging."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Logging ───────────────────────────────────────────────────────────

    async def log(
        self,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        user_id: str | None = None,
        details: dict[str, Any] | None = None,
        ip_address: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> MLOpsAuditLog:
        """Log an MLOps audit event."""
        entry = MLOpsAuditLog(
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            user_id=user_id,
            details=json.dumps(details) if details else None,
            ip_address=ip_address,
            metadata_=metadata,
        )
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def log_dataset_created(
        self,
        dataset_id: str,
        user_id: str,
        details: dict[str, Any] | None = None,
    ) -> MLOpsAuditLog:
        """Log dataset creation."""
        return await self.log(
            action="dataset_created",
            resource_type="dataset_candidate",
            resource_id=dataset_id,
            user_id=user_id,
            details=details,
        )

    async def log_dataset_approved(
        self,
        dataset_id: str,
        user_id: str,
        approved: bool,
        reason: str | None = None,
    ) -> MLOpsAuditLog:
        """Log dataset approval/rejection."""
        return await self.log(
            action="dataset_approved" if approved else "dataset_rejected",
            resource_type="dataset_candidate",
            resource_id=dataset_id,
            user_id=user_id,
            details={"approved": approved, "reason": reason},
        )

    async def log_training_initiated(
        self,
        job_id: str,
        user_id: str,
        model_id: str,
        dataset_id: str,
        trigger_id: str | None = None,
    ) -> MLOpsAuditLog:
        """Log training initiation."""
        return await self.log(
            action="training_initiated",
            resource_type="training_job",
            resource_id=job_id,
            user_id=user_id,
            details={
                "model_id": model_id,
                "dataset_id": dataset_id,
                "trigger_id": trigger_id,
            },
        )

    async def log_model_evaluated(
        self,
        evaluation_id: str,
        user_id: str,
        model_version_id: str,
        meets_thresholds: bool,
    ) -> MLOpsAuditLog:
        """Log model evaluation."""
        return await self.log(
            action="model_evaluated",
            resource_type="model_evaluation",
            resource_id=evaluation_id,
            user_id=user_id,
            details={
                "model_version_id": model_version_id,
                "meets_thresholds": meets_thresholds,
            },
        )

    async def log_model_promoted(
        self,
        promotion_id: str,
        user_id: str,
        model_id: str,
        from_version_id: str | None,
        to_version_id: str,
        from_stage: str,
        to_stage: str,
    ) -> MLOpsAuditLog:
        """Log model promotion."""
        return await self.log(
            action="model_promoted",
            resource_type="model_promotion",
            resource_id=promotion_id,
            user_id=user_id,
            details={
                "model_id": model_id,
                "from_version_id": from_version_id,
                "to_version_id": to_version_id,
                "from_stage": from_stage,
                "to_stage": to_stage,
            },
        )

    async def log_model_rolled_back(
        self,
        promotion_id: str,
        user_id: str,
        model_id: str,
        from_version_id: str,
        to_version_id: str,
        reason: str,
    ) -> MLOpsAuditLog:
        """Log model rollback."""
        return await self.log(
            action="model_rolled_back",
            resource_type="model_promotion",
            resource_id=promotion_id,
            user_id=user_id,
            details={
                "model_id": model_id,
                "from_version_id": from_version_id,
                "to_version_id": to_version_id,
                "reason": reason,
            },
        )

    async def log_drift_detected(
        self,
        model_id: str,
        metric_type: str,
        drift_score: float,
        severity: str,
    ) -> MLOpsAuditLog:
        """Log drift detection."""
        return await self.log(
            action="drift_detected",
            resource_type="drift_snapshot",
            resource_id=model_id,
            details={
                "metric_type": metric_type,
                "drift_score": drift_score,
                "severity": severity,
            },
        )

    async def log_annotation_added(
        self,
        candidate_id: str,
        user_id: str,
        annotation: dict[str, Any],
    ) -> MLOpsAuditLog:
        """Log annotation activity."""
        return await self.log(
            action="annotation_added",
            resource_type="active_learning_candidate",
            resource_id=candidate_id,
            user_id=user_id,
            details=annotation,
        )

    # ─── MLOps Lifecycle Actions ───────────────────────────────────────────

    async def log_experiment_created(
        self,
        experiment_id: str,
        user_id: str,
        name: str,
    ) -> MLOpsAuditLog:
        """Log experiment creation."""
        return await self.log(
            action="experiment_created",
            resource_type="experiment",
            resource_id=experiment_id,
            user_id=user_id,
            details={"name": name},
        )

    async def log_experiment_run_created(
        self,
        run_id: str,
        experiment_id: str,
        user_id: str,
        name: str,
    ) -> MLOpsAuditLog:
        """Log experiment run creation."""
        return await self.log(
            action="experiment_run_created",
            resource_type="experiment_run",
            resource_id=run_id,
            user_id=user_id,
            details={"experiment_id": experiment_id, "name": name},
        )

    async def log_experiment_run_completed(
        self,
        run_id: str,
        user_id: str,
        metrics: dict[str, Any] | None = None,
    ) -> MLOpsAuditLog:
        """Log experiment run completion."""
        return await self.log(
            action="experiment_run_completed",
            resource_type="experiment_run",
            resource_id=run_id,
            user_id=user_id,
            details={"metrics": metrics} if metrics else None,
        )

    async def log_model_version_registered(
        self,
        version_id: str,
        model_name: str,
        user_id: str,
    ) -> MLOpsAuditLog:
        """Log model version registration."""
        return await self.log(
            action="model_version_registered",
            resource_type="model_version",
            resource_id=version_id,
            user_id=user_id,
            details={"model_name": model_name},
        )

    async def log_model_version_status_updated(
        self,
        version_id: str,
        user_id: str,
        from_status: str,
        to_status: str,
    ) -> MLOpsAuditLog:
        """Log model version status change."""
        return await self.log(
            action="model_version_status_updated",
            resource_type="model_version",
            resource_id=version_id,
            user_id=user_id,
            details={"from_status": from_status, "to_status": to_status},
        )

    async def log_model_alias_assigned(
        self,
        version_id: str,
        user_id: str,
        alias: str,
        previous_version_id: str | None = None,
    ) -> MLOpsAuditLog:
        """Log model alias assignment."""
        return await self.log(
            action="model_alias_assigned",
            resource_type="model_version_alias",
            resource_id=version_id,
            user_id=user_id,
            details={"alias": alias, "previous_version_id": previous_version_id},
        )

    async def log_model_comparison_created(
        self,
        comparison_id: str,
        user_id: str,
        version_ids: list[str],
    ) -> MLOpsAuditLog:
        """Log model comparison creation."""
        return await self.log(
            action="model_comparison_created",
            resource_type="model_comparison",
            resource_id=comparison_id,
            user_id=user_id,
            details={"version_ids": version_ids},
        )

    async def log_lineage_edge_created(
        self,
        source_version_id: str,
        target_version_id: str,
        user_id: str,
        relationship: str,
    ) -> MLOpsAuditLog:
        """Log lineage edge creation."""
        return await self.log(
            action="lineage_edge_created",
            resource_type="model_lineage_edge",
            resource_id=f"{source_version_id}->{target_version_id}",
            user_id=user_id,
            details={"relationship": relationship},
        )

    async def log_production_inference(
        self,
        inference_id: str,
        version_id: str,
        model_version: str,
    ) -> MLOpsAuditLog:
        """Log production inference request."""
        return await self.log(
            action="production_inference",
            resource_type="production_inference_record",
            resource_id=inference_id,
            details={"version_id": version_id, "model_version": model_version},
        )

    async def log_import_completed(
        self,
        import_id: str,
        user_id: str,
        source: str,
        imported_count: int,
    ) -> MLOpsAuditLog:
        """Log import completion."""
        return await self.log(
            action="import_completed",
            resource_type="import_job",
            resource_id=import_id,
            user_id=user_id,
            details={"source": source, "imported_count": imported_count},
        )

    # ─── Query ─────────────────────────────────────────────────────────────

    async def get_logs(
        self,
        action: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        user_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[MLOpsAuditLog]:
        """Get audit logs with filters."""
        query = select(MLOpsAuditLog)
        if action:
            query = query.where(MLOpsAuditLog.action == action)
        if resource_type:
            query = query.where(MLOpsAuditLog.resource_type == resource_type)
        if resource_id:
            query = query.where(MLOpsAuditLog.resource_id == resource_id)
        if user_id:
            query = query.where(MLOpsAuditLog.user_id == user_id)
        query = query.order_by(MLOpsAuditLog.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_resource_history(
        self,
        resource_type: str,
        resource_id: str,
    ) -> list[MLOpsAuditLog]:
        """Get audit history for a specific resource."""
        query = (
            select(MLOpsAuditLog)
            .where(
                MLOpsAuditLog.resource_type == resource_type,
                MLOpsAuditLog.resource_id == resource_id,
            )
            .order_by(MLOpsAuditLog.created_at)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_statistics(
        self,
        days: int = 30,
    ) -> dict[str, Any]:
        """Get audit log statistics."""
        # Count by action
        action_counts = await self._count_by_action(days)
        # Count by resource type
        resource_counts = await self._count_by_resource_type(days)
        # Total operations
        total = sum(action_counts.values())

        return {
            "period_days": days,
            "total_operations": total,
            "by_action": action_counts,
            "by_resource_type": resource_counts,
            "actions_per_day": round(total / days, 2) if days > 0 else 0,
        }

    async def _count_by_action(self, days: int) -> dict[str, int]:
        """Count operations by action."""
        from datetime import timedelta

        cutoff = datetime.now(UTC) - timedelta(days=days)
        query = (
            select(
                MLOpsAuditLog.action,
                func.count(MLOpsAuditLog.id),
            )
            .where(MLOpsAuditLog.created_at >= cutoff)
            .group_by(MLOpsAuditLog.action)
        )
        result = await self.db.execute(query)
        return dict(cast(Iterable[tuple[str, int]], result.all()))

    async def _count_by_resource_type(self, days: int) -> dict[str, int]:
        """Count operations by resource type."""
        from datetime import timedelta

        cutoff = datetime.now(UTC) - timedelta(days=days)
        query = (
            select(
                MLOpsAuditLog.resource_type,
                func.count(MLOpsAuditLog.id),
            )
            .where(MLOpsAuditLog.created_at >= cutoff)
            .group_by(MLOpsAuditLog.resource_type)
        )
        result = await self.db.execute(query)
        return dict(cast(Iterable[tuple[str, int]], result.all()))

    async def commit(self) -> None:
        """Commit the current transaction."""
        await self.db.commit()
