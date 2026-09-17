"""
Data Pipeline Service

Handles dataset validation, quality checks, and approval workflows.
Implements safety measures to prevent arbitrary user uploads from becoming
trusted training data.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.mlops import (
    ApprovalStatus,
    DatasetCandidate,
    DatasetQualityCheck,
)
from app.schemas.mlops import (
    DatasetCandidateApproval,
    DatasetCandidateCreate,
)


class DataPipelineService:
    """Service for dataset validation, quality checks, and approval."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Candidate Management ──────────────────────────────────────────────

    async def create_candidate(
        self,
        data: DatasetCandidateCreate,
        user_id: str,
    ) -> DatasetCandidate:
        """Create a new dataset candidate and run quality checks."""
        candidate = DatasetCandidate(
            name=data.name,
            description=data.description,
            media_type=data.media_type,
            storage_path=data.storage_path,
            sample_count=data.sample_count,
            approval_status=ApprovalStatus.PENDING.value,
            created_by=user_id,
        )
        self.db.add(candidate)
        await self.db.flush()

        # Run quality checks
        await self._run_quality_checks(candidate)

        await self.db.commit()
        await self.db.refresh(candidate)
        return candidate

    async def get_candidate(self, candidate_id: str) -> DatasetCandidate | None:
        """Get a dataset candidate by ID."""
        query = (
            select(DatasetCandidate)
            .options(selectinload(DatasetCandidate.quality_checks))
            .where(DatasetCandidate.id == candidate_id)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_candidates(
        self,
        status: str | None = None,
        media_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[DatasetCandidate]:
        """List dataset candidates with optional filters."""
        query = select(DatasetCandidate).options(selectinload(DatasetCandidate.quality_checks))
        if status:
            query = query.where(DatasetCandidate.approval_status == status)
        if media_type:
            query = query.where(DatasetCandidate.media_type == media_type)
        query = query.order_by(DatasetCandidate.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ─── Approval Workflow ─────────────────────────────────────────────────

    async def approve_candidate(
        self,
        candidate_id: str,
        approval: DatasetCandidateApproval,
        approver_id: str,
    ) -> DatasetCandidate:
        """Approve or reject a dataset candidate."""
        candidate = await self.get_candidate(candidate_id)
        if not candidate:
            raise ValueError(f"Dataset candidate {candidate_id} not found")

        if candidate.approval_status != ApprovalStatus.PENDING.value:
            raise ValueError(f"Dataset candidate is not pending approval (status: {candidate.approval_status})")

        # Safety check: ensure quality checks passed
        if approval.approved:
            quality_issues = await self._check_quality_requirements(candidate)
            if quality_issues:
                raise ValueError(f"Quality checks failed: {'; '.join(quality_issues)}")

        now = datetime.now(UTC)
        if approval.approved:
            candidate.approval_status = ApprovalStatus.APPROVED.value
            candidate.approved_by = approver_id
            candidate.approved_at = now
        else:
            candidate.approval_status = ApprovalStatus.REJECTED.value
            candidate.approved_by = approver_id
            candidate.approved_at = now
            candidate.rejection_reason = approval.rejection_reason

        await self.db.commit()
        await self.db.refresh(candidate)
        return candidate

    async def get_pending_count(self) -> int:
        """Get count of pending approvals."""
        query = select(func.count(DatasetCandidate.id)).where(
            DatasetCandidate.approval_status == ApprovalStatus.PENDING.value
        )
        result = await self.db.execute(query)
        return result.scalar() or 0

    # ─── Quality Checks ────────────────────────────────────────────────────

    async def _run_quality_checks(self, candidate: DatasetCandidate) -> None:
        """Run quality checks on a dataset candidate."""
        checks = []

        # 1. Sample count validation
        sample_count_check = DatasetQualityCheck(
            dataset_candidate_id=candidate.id,
            check_name="sample_count",
            check_type="validation",
            status="passed" if candidate.sample_count > 0 else "failed",
            score=1.0 if candidate.sample_count > 0 else 0.0,
            details={"sample_count": candidate.sample_count},
            message="Dataset has samples" if candidate.sample_count > 0 else "Dataset has no samples",
        )
        checks.append(sample_count_check)

        # 2. Media type validation
        valid_media_types = {"text", "image", "audio", "video", "document"}
        media_type_check = DatasetQualityCheck(
            dataset_candidate_id=candidate.id,
            check_name="media_type",
            check_type="validation",
            status="passed" if candidate.media_type in valid_media_types else "failed",
            score=1.0 if candidate.media_type in valid_media_types else 0.0,
            details={"media_type": candidate.media_type, "valid_types": list(valid_media_types)},
            message=f"Media type '{candidate.media_type}' is valid"
            if candidate.media_type in valid_media_types
            else f"Invalid media type '{candidate.media_type}'",
        )
        checks.append(media_type_check)

        # 3. Checksum validation (if provided)
        if candidate.checksum:
            checksum_check = DatasetQualityCheck(
                dataset_candidate_id=candidate.id,
                check_name="checksum",
                check_type="integrity",
                status="passed",
                score=1.0,
                details={"checksum": candidate.checksum},
                message="Checksum provided",
            )
            checks.append(checksum_check)

        # 4. Quality score calculation
        passed_checks = sum(1 for c in checks if c.status == "passed")
        quality_score = passed_checks / len(checks) if checks else 0.0
        candidate.quality_score = quality_score
        candidate.validation_report = json.dumps(
            {
                "total_checks": len(checks),
                "passed": passed_checks,
                "failed": len(checks) - passed_checks,
                "quality_score": quality_score,
            }
        )

        for check in checks:
            self.db.add(check)

    async def _check_quality_requirements(self, candidate: DatasetCandidate) -> list[str]:
        """Check if candidate meets quality requirements for approval."""
        issues = []

        if candidate.sample_count <= 0:
            issues.append("Dataset must have at least one sample")

        if candidate.quality_score is not None and candidate.quality_score < 0.5:
            issues.append(f"Quality score {candidate.quality_score:.2f} is below minimum threshold (0.5)")

        # Check for critical quality check failures
        query = select(DatasetQualityCheck).where(
            DatasetQualityCheck.dataset_candidate_id == candidate.id,
            DatasetQualityCheck.status == "failed",
        )
        result = await self.db.execute(query)
        failed_checks = list(result.scalars().all())
        if failed_checks:
            issues.append(
                f"{len(failed_checks)} quality check(s) failed: " + ", ".join(c.check_name for c in failed_checks)
            )

        return issues

    async def get_quality_checks(self, candidate_id: str) -> list[DatasetQualityCheck]:
        """Get quality checks for a dataset candidate."""
        query = (
            select(DatasetQualityCheck)
            .where(DatasetQualityCheck.dataset_candidate_id == candidate_id)
            .order_by(DatasetQualityCheck.created_at)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())
