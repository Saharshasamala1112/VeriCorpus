"""
Training Trigger and Job Management Service

Handles training triggers with configurable strategies and training job lifecycle.
Implements the full flow: trigger → job creation → status transitions → completion.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import cast

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.mlops import (
    DatasetCandidate,
    TrainingJobStatus,
    TrainingJobV2,
    TrainingTrigger,
)
from app.schemas.mlops import (
    TrainingJobCreate,
    TrainingJobStatusUpdate,
    TrainingTriggerCreate,
    TrainingTriggerUpdate,
    TriggerEvaluation,
)


class TrainingTriggerService:
    """Service for training triggers and job management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Trigger Management ────────────────────────────────────────────────

    async def create_trigger(
        self,
        data: TrainingTriggerCreate,
        user_id: str,
    ) -> TrainingTrigger:
        """Create a new training trigger."""
        trigger = TrainingTrigger(
            name=data.name,
            trigger_type=data.trigger_type,
            is_active=True,
            config=json.dumps(data.config) if data.config else None,
            created_by=user_id,
        )
        self.db.add(trigger)
        await self.db.commit()
        await self.db.refresh(trigger)
        return trigger

    async def get_trigger(self, trigger_id: str) -> TrainingTrigger | None:
        """Get a training trigger by ID."""
        query = select(TrainingTrigger).where(TrainingTrigger.id == trigger_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_triggers(
        self,
        active_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> list[TrainingTrigger]:
        """List training triggers."""
        query = select(TrainingTrigger)
        if active_only:
            query = query.where(TrainingTrigger.is_active)
        query = query.order_by(TrainingTrigger.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_trigger(
        self,
        trigger_id: str,
        data: TrainingTriggerUpdate,
    ) -> TrainingTrigger:
        """Update a training trigger."""
        trigger = await self.get_trigger(trigger_id)
        if not trigger:
            raise ValueError(f"Training trigger {trigger_id} not found")

        if data.name is not None:
            trigger.name = data.name
        if data.is_active is not None:
            trigger.is_active = data.is_active
        if data.config is not None:
            trigger.config = json.dumps(data.config)

        await self.db.commit()
        await self.db.refresh(trigger)
        return trigger

    async def evaluate_trigger(
        self,
        trigger_id: str,
        new_samples_count: int,
        *,
        feedback_count: int = 0,
        drift_score: float | None = None,
        now: datetime | None = None,
    ) -> TriggerEvaluation:
        """Evaluate whether a trigger should fire."""
        trigger = await self.get_trigger(trigger_id)
        if not trigger:
            raise ValueError(f"Training trigger {trigger_id} not found")

        config = json.loads(trigger.config) if trigger.config else {}
        should_fire = False
        reason = ""
        threshold = None
        next_scheduled = None

        if trigger.trigger_type == "manual":
            # Manual triggers never auto-fire
            should_fire = False
            reason = "Manual trigger - requires explicit invocation"
        elif trigger.trigger_type == "sample_threshold":
            threshold = config.get("threshold", 100)
            should_fire = new_samples_count >= threshold
            reason = f"Sample count ({new_samples_count}) {'meets' if should_fire else 'below'} threshold ({threshold})"
        elif trigger.trigger_type == "scheduled":
            cron = config.get("cron")
            if cron:
                # Simplified: assume scheduled triggers fire periodically
                should_fire = True
                reason = f"Scheduled trigger (cron: {cron})"
            else:
                reason = "Scheduled trigger without cron configuration"
        elif trigger.trigger_type == "dataset_version":
            min_version_count = config.get("min_version_count", 1)
            should_fire = new_samples_count >= min_version_count
            reason = (
                f"Dataset version trigger: {new_samples_count} new samples "
                f"{'meets' if should_fire else 'below'} minimum ({min_version_count})"
            )
        elif trigger.trigger_type in {"significant_new_data", "significant_data"}:
            threshold = config.get("threshold", 100)
            should_fire = new_samples_count >= threshold
            reason = f"Significant new data ({new_samples_count}) {'meets' if should_fire else 'below'} threshold ({threshold})"
        elif trigger.trigger_type == "feedback_threshold":
            threshold = config.get("threshold", 10)
            should_fire = feedback_count >= threshold
            reason = f"Feedback count ({feedback_count}) {'meets' if should_fire else 'below'} threshold ({threshold})"
        elif trigger.trigger_type == "drift_threshold":
            threshold = float(config.get("threshold", 0.2))
            should_fire = drift_score is not None and drift_score >= threshold
            reason = (
                f"Drift score ({drift_score}) {'meets' if should_fire else 'below or unavailable'} "
                f"threshold ({threshold})"
            )
        else:
            reason = f"Unknown trigger type: {trigger.trigger_type}"

        return TriggerEvaluation(
            trigger_id=trigger_id,
            should_fire=should_fire,
            reason=reason,
            new_samples_since_last=new_samples_count,
            threshold=threshold,
            next_scheduled=next_scheduled,
        )

    # ─── Training Job Management ───────────────────────────────────────────

    async def create_job(
        self,
        data: TrainingJobCreate,
        user_id: str,
    ) -> TrainingJobV2:
        """Create a new training job."""
        # Validate dataset candidate exists and is approved
        dataset_candidate = await self._get_approved_candidate(data.dataset_candidate_id)
        if not dataset_candidate:
            raise ValueError(f"Dataset candidate {data.dataset_candidate_id} not found or not approved")

        # Generate unique job ID
        job_id = f"job-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}-{dataset_candidate.media_type}"

        config_snapshot = {
            "model_id": data.model_id,
            "dataset_candidate_id": data.dataset_candidate_id,
            "base_model_version": data.base_model_version,
            "hyperparameters": data.hyperparameters,
            "compute_config": data.compute_config,
            "created_by": user_id,
            "created_at": datetime.now(UTC).isoformat(),
        }

        job = TrainingJobV2(
            job_id=job_id,
            model_id=data.model_id,
            dataset_candidate_id=data.dataset_candidate_id,
            trigger_id=data.trigger_id,
            status=TrainingJobStatus.QUEUED.value,
            base_model_version=data.base_model_version,
            hyperparameters=json.dumps(data.hyperparameters) if data.hyperparameters else None,
            compute_config=json.dumps(data.compute_config) if data.compute_config else None,
            config_snapshot=json.dumps(config_snapshot),
            queued_at=datetime.now(UTC),
        )
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)
        return job

    async def get_job(self, job_id: str) -> TrainingJobV2 | None:
        """Get a training job by ID."""
        query = (
            select(TrainingJobV2)
            .options(
                selectinload(TrainingJobV2.model),
                selectinload(TrainingJobV2.dataset_candidate),
                selectinload(TrainingJobV2.trigger),
            )
            .where(TrainingJobV2.id == job_id)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_jobs(
        self,
        status: str | None = None,
        model_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[TrainingJobV2]:
        """List training jobs with optional filters."""
        query = select(TrainingJobV2).options(
            selectinload(TrainingJobV2.model),
            selectinload(TrainingJobV2.dataset_candidate),
        )
        if status:
            query = query.where(TrainingJobV2.status == status)
        if model_id:
            query = query.where(TrainingJobV2.model_id == model_id)
        query = query.order_by(TrainingJobV2.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_job_status(
        self,
        job_id: str,
        data: TrainingJobStatusUpdate,
    ) -> TrainingJobV2:
        """Update training job status with transition validation."""
        job = await self.get_job(job_id)
        if not job:
            raise ValueError(f"Training job {job_id} not found")

        # Validate state transition
        self._validate_transition(job.status, data.status)

        now = datetime.now(UTC)
        job.status = data.status

        if data.status == TrainingJobStatus.RUNNING.value:
            job.started_at = now
        elif data.status in (
            TrainingJobStatus.SUCCEEDED.value,
            TrainingJobStatus.FAILED.value,
        ):
            job.completed_at = now

        if data.error_message:
            job.error_message = data.error_message
        if data.artifact_location:
            job.artifact_location = data.artifact_location
        if data.logs_location:
            job.logs_location = data.logs_location

        await self.db.commit()
        await self.db.refresh(job)
        return job

    async def cancel_job(self, job_id: str) -> TrainingJobV2:
        """Cancel a training job."""
        job = await self.get_job(job_id)
        if not job:
            raise ValueError(f"Training job {job_id} not found")

        # Can only cancel queued or running jobs
        if job.status not in (TrainingJobStatus.QUEUED.value, TrainingJobStatus.RUNNING.value):
            raise ValueError(f"Cannot cancel job in status {job.status}")

        job.status = TrainingJobStatus.CANCELLED.value
        job.completed_at = datetime.now(UTC)

        await self.db.commit()
        await self.db.refresh(job)
        return job

    async def get_job_counts(self) -> dict[str, int]:
        """Get counts of jobs by status."""
        query = select(
            TrainingJobV2.status,
            func.count(TrainingJobV2.id),
        ).group_by(TrainingJobV2.status)
        result = await self.db.execute(query)
        return dict(cast(Iterable[tuple[str, int]], result.all()))

    # ─── Helper Methods ────────────────────────────────────────────────────

    async def _get_approved_candidate(self, candidate_id: str) -> DatasetCandidate | None:
        """Get an approved dataset candidate."""
        query = select(DatasetCandidate).where(
            DatasetCandidate.id == candidate_id,
            DatasetCandidate.approval_status == "approved",
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    def _validate_transition(self, current_status: str, new_status: str) -> None:
        """Validate state transition."""
        valid_transitions = {
            TrainingJobStatus.QUEUED.value: [
                TrainingJobStatus.RUNNING.value,
                TrainingJobStatus.CANCELLED.value,
            ],
            TrainingJobStatus.RUNNING.value: [
                TrainingJobStatus.EVALUATING.value,
                TrainingJobStatus.SUCCEEDED.value,
                TrainingJobStatus.FAILED.value,
                TrainingJobStatus.CANCELLED.value,
            ],
            TrainingJobStatus.EVALUATING.value: [
                TrainingJobStatus.SUCCEEDED.value,
                TrainingJobStatus.FAILED.value,
            ],
            TrainingJobStatus.SUCCEEDED.value: [],
            TrainingJobStatus.FAILED.value: [],
            TrainingJobStatus.CANCELLED.value: [],
        }

        allowed = valid_transitions.get(current_status, [])
        if new_status not in allowed:
            raise ValueError(f"Invalid transition from {current_status} to {new_status}. Allowed: {allowed}")
