"""
Model Promotion Service

Handles model promotion, rollback, and registry management.
Implements immutable versioning, MLflow-compatible aliases, and production safety.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.all_models import Model, ModelVersion
from app.models.mlops import (
    VALID_STATUS_TRANSITIONS,
    ApprovalStatus,
    ModelEvaluation,
    ModelLifecycleStatus,
    ModelPromotion,
    ModelStage,
    ModelVersionAlias,
    ModelVersionMetadata,
)
from app.schemas.mlops import (
    ModelPromotionCreate,
    ModelRollbackCreate,
)
from app.services.mlflow_adapter import MLflowModelRegistryService


class ModelPromotionService:
    """Service for model promotion and rollback with alias support."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.registry = MLflowModelRegistryService(db)

    # ─── Promotion ─────────────────────────────────────────────────────────

    async def promote_model(
        self,
        data: ModelPromotionCreate,
        user_id: str,
    ) -> ModelPromotion:
        """Promote a model version to the next stage."""
        model = await self._get_model(data.model_id)
        if not model:
            raise ValueError(f"Model {data.model_id} not found")

        to_version = await self._get_model_version(data.to_version_id)
        if not to_version:
            raise ValueError(f"Model version {data.to_version_id} not found")
        if to_version.model_id != data.model_id:
            raise ValueError(f"Model version {data.to_version_id} does not belong to model {data.model_id}")

        current_production = await self._get_production_version(data.model_id)

        if current_production:
            from_stage = ModelStage.PRODUCTION.value
            to_stage = ModelStage.STAGING.value
            action = "promote"
        else:
            from_stage = ModelStage.CANDIDATE.value
            to_stage = ModelStage.PRODUCTION.value
            action = "promote"

        promotion = ModelPromotion(
            model_id=data.model_id,
            from_version_id=current_production.id if current_production else None,
            to_version_id=data.to_version_id,
            action=action,
            from_stage=from_stage,
            to_stage=to_stage,
            reason=data.reason,
            performed_by=user_id,
        )
        self.db.add(promotion)

        to_version.status = to_stage
        to_version.trained_at = datetime.now(UTC)

        if to_stage == ModelStage.PRODUCTION.value and current_production:
            current_production.status = ModelStage.RETIRED.value
            # Assign aliases
            await self.registry.assign_alias(data.model_id, data.to_version_id, "production", user_id)
            await self.registry.assign_alias(data.model_id, data.to_version_id, "champion", user_id)
            await self.registry.remove_alias(data.model_id, "production")
            # Re-assign after removal
            await self.registry.assign_alias(data.model_id, data.to_version_id, "production", user_id)

        await self.db.commit()
        await self.db.refresh(promotion)
        return promotion

    async def promote_to_production(
        self,
        model_id: str,
        version_id: str,
        user_id: str,
        reason: str | None = None,
    ) -> ModelPromotion:
        """Directly promote a model version to production."""
        model = await self._get_model(model_id)
        if not model:
            raise ValueError(f"Model {model_id} not found")

        to_version = await self._get_model_version(version_id)
        if not to_version:
            raise ValueError(f"Model version {version_id} not found")
        if to_version.model_id != model_id:
            raise ValueError(f"Model version {version_id} does not belong to model {model_id}")

        evaluation = await self._get_approved_evaluation(version_id)
        if not evaluation:
            raise ValueError(
                f"No approved evaluation found for model version {version_id}. "
                "Model must be evaluated and approved before production promotion."
            )

        current_production = await self._get_production_version(model_id)

        promotion = ModelPromotion(
            model_id=model_id,
            from_version_id=current_production.id if current_production else None,
            to_version_id=version_id,
            action="promote",
            from_stage=current_production.status if current_production else ModelStage.CANDIDATE.value,
            to_stage=ModelStage.PRODUCTION.value,
            reason=reason or "Promoted to production",
            performed_by=user_id,
        )
        self.db.add(promotion)

        to_version.status = ModelStage.PRODUCTION.value
        to_version.trained_at = datetime.now(UTC)

        if current_production:
            current_production.status = ModelStage.RETIRED.value
            await self.registry.remove_alias(model_id, "production")
            await self.registry.remove_alias(model_id, "champion")

        await self.registry.assign_alias(model_id, version_id, "production", user_id)
        await self.registry.assign_alias(model_id, version_id, "champion", user_id)

        await self.db.commit()
        await self.db.refresh(promotion)
        return promotion

    # ─── Rollback ──────────────────────────────────────────────────────────

    async def rollback_model(
        self,
        data: ModelRollbackCreate,
        user_id: str,
    ) -> ModelPromotion:
        """Rollback to a previous model version."""
        model = await self._get_model(data.model_id)
        if not model:
            raise ValueError(f"Model {data.model_id} not found")

        target_version = await self._get_model_version(data.target_version_id)
        if not target_version:
            raise ValueError(f"Model version {data.target_version_id} not found")
        if target_version.model_id != data.model_id:
            raise ValueError(f"Model version {data.target_version_id} does not belong to model {data.model_id}")

        current_production = await self._get_production_version(data.model_id)
        if not current_production:
            raise ValueError("No production model to rollback from")
        if current_production.id == data.target_version_id:
            raise ValueError("Cannot rollback to the same version")

        promotion = ModelPromotion(
            model_id=data.model_id,
            from_version_id=current_production.id,
            to_version_id=data.target_version_id,
            action="rollback",
            from_stage=ModelStage.PRODUCTION.value,
            to_stage=ModelStage.PRODUCTION.value,
            reason=data.reason,
            performed_by=user_id,
        )
        self.db.add(promotion)

        current_production.status = ModelStage.RETIRED.value
        target_version.status = ModelStage.PRODUCTION.value
        target_version.trained_at = datetime.now(UTC)

        # Update aliases
        await self.registry.remove_alias(data.model_id, "production")
        await self.registry.remove_alias(data.model_id, "champion")
        await self.registry.assign_alias(data.model_id, data.target_version_id, "production", user_id)
        await self.registry.assign_alias(data.model_id, data.target_version_id, "rollback", user_id)

        await self.db.commit()
        await self.db.refresh(promotion)
        return promotion

    # ─── Lifecycle Status ──────────────────────────────────────────────────

    async def update_version_status(
        self,
        version_id: str,
        new_status: str,
        user_id: str | None = None,
        reason: str | None = None,
    ) -> ModelVersion:
        """Update model version status with transition validation."""
        mv = await self._get_model_version(version_id)
        if not mv:
            raise ValueError(f"Model version {version_id} not found")

        try:
            current = ModelLifecycleStatus(mv.status)
            target = ModelLifecycleStatus(new_status)
        except ValueError as e:
            raise ValueError(f"Invalid status: {e}") from e

        allowed = VALID_STATUS_TRANSITIONS.get(current, [])
        if target not in allowed:
            raise ValueError(
                f"Invalid status transition {current.value} -> {target.value}. Allowed: {[s.value for s in allowed]}"
            )

        mv.status = target.value

        # Set retirement_at if retiring
        if target == ModelLifecycleStatus.RETIRED:
            meta = await self._get_version_metadata(version_id)
            if meta:
                meta.retirement_at = datetime.now(UTC)

        await self.db.commit()
        await self.db.refresh(mv)
        return mv

    # ─── Alias Management ─────────────────────────────────────────────────

    async def assign_alias(
        self,
        model_id: str,
        version_id: str,
        alias: str,
        assigned_by: str | None = None,
    ) -> ModelVersionAlias:
        """Assign an alias to a model version."""
        return await self.registry.assign_alias(model_id, version_id, alias, assigned_by)

    async def remove_alias(self, model_id: str, alias: str) -> bool:
        """Remove an alias from a model version."""
        return await self.registry.remove_alias(model_id, alias)

    async def get_alias_version(self, model_id: str, alias: str) -> ModelVersion | None:
        """Get the model version that holds a specific alias."""
        return await self.registry.get_alias_version(model_id, alias)

    # ─── Registry Queries ──────────────────────────────────────────────────

    async def get_model_versions(
        self,
        model_id: str,
        status: str | None = None,
    ) -> list[ModelVersion]:
        """Get all versions of a model."""
        query = select(ModelVersion).where(ModelVersion.model_id == model_id)
        if status:
            query = query.where(ModelVersion.status == status)
        query = query.order_by(ModelVersion.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_version_with_metadata(self, version_id: str) -> dict[str, Any] | None:
        """Get a model version with all extended metadata."""
        mv = await self._get_model_version(version_id)
        if not mv:
            return None

        meta = await self._get_version_metadata(version_id)
        aliases = await self.registry.get_aliases(mv.model_id, version_id)

        raw_metrics: str | None = mv.metrics  # type: ignore[assignment]
        parsed_metrics = json.loads(raw_metrics) if raw_metrics else {}

        result: dict[str, Any] = {
            "id": mv.id,
            "model_id": mv.model_id,
            "version": mv.version,
            "status": mv.status,
            "name": meta.name if meta else None,
            "modality": meta.modality if meta else None,
            "architecture": meta.architecture if meta else None,
            "dataset_version": meta.dataset_version if meta else None,
            "preprocessing_version": meta.preprocessing_version if meta else None,
            "tokenizer_version": meta.tokenizer_version if meta else None,
            "embedding_version": meta.embedding_version if meta else None,
            "training_run_id": mv.training_run_id,
            "checkpoint": meta.checkpoint if meta else None,
            "artifact_uri": meta.artifact_uri if meta else None,
            "evaluation_run_id": meta.evaluation_run_id if meta else None,
            "calibration": json.loads(meta.calibration) if meta and meta.calibration else None,
            "deployment": json.loads(meta.deployment) if meta and meta.deployment else None,
            "retirement_at": meta.retirement_at.isoformat() if meta and meta.retirement_at else None,
            "parent_version_id": meta.parent_version_id if meta else None,
            "changelog": meta.changelog if meta else None,
            "aliases": aliases,
            "tags": {},
            "metrics": parsed_metrics,
            "created_at": mv.created_at.isoformat() if mv.created_at else None,
            "updated_at": mv.updated_at.isoformat() if mv.updated_at else None,
        }
        return result

    async def get_production_version(self, model_id: str) -> ModelVersion | None:
        """Get the current production version of a model."""
        return await self._get_production_version(model_id)

    async def get_promotion_history(
        self,
        model_id: str,
        limit: int = 20,
    ) -> list[ModelPromotion]:
        """Get promotion/rollback history for a model."""
        query = (
            select(ModelPromotion)
            .options(
                selectinload(ModelPromotion.from_version),
                selectinload(ModelPromotion.to_version),
            )
            .where(ModelPromotion.model_id == model_id)
            .order_by(ModelPromotion.created_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ─── Helper Methods ────────────────────────────────────────────────────

    async def _get_model(self, model_id: str) -> Model | None:
        result = await self.db.execute(select(Model).where(Model.id == model_id))
        return result.scalar_one_or_none()

    async def _get_model_version(self, version_id: str) -> ModelVersion | None:
        result = await self.db.execute(select(ModelVersion).where(ModelVersion.id == version_id))
        return result.scalar_one_or_none()

    async def _get_production_version(self, model_id: str) -> ModelVersion | None:
        query = (
            select(ModelVersion)
            .where(
                ModelVersion.model_id == model_id,
                ModelVersion.status == ModelStage.PRODUCTION.value,
            )
            .limit(1)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_approved_evaluation(self, version_id: str) -> ModelEvaluation | None:
        query = (
            select(ModelEvaluation)
            .where(
                ModelEvaluation.model_version_id == version_id,
                ModelEvaluation.approval_status == ApprovalStatus.APPROVED.value,
            )
            .limit(1)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_version_metadata(self, version_id: str) -> ModelVersionMetadata | None:
        result = await self.db.execute(
            select(ModelVersionMetadata).where(ModelVersionMetadata.model_version_id == version_id)
        )
        return result.scalar_one_or_none()
