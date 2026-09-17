"""
Active Learning Service

Interfaces for low-confidence, disagreement, and reviewer-selected samples.
Implements priority-based selection and annotation workflows.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mlops import ActiveLearningCandidate
from app.schemas.mlops import (
    ActiveLearningAnnotation,
    ActiveLearningCandidateCreate,
)


class ActiveLearningService:
    """Service for active learning interfaces."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Candidate Management ──────────────────────────────────────────────

    async def create_candidate(
        self,
        data: ActiveLearningCandidateCreate,
    ) -> ActiveLearningCandidate:
        """Create a new active learning candidate."""
        candidate = ActiveLearningCandidate(
            sample_id=data.sample_id,
            media_type=data.media_type,
            source=data.source,
            selection_reason=data.selection_reason,
            confidence_score=data.confidence_score,
            disagreement_score=data.disagreement_score,
            priority=data.priority,
            status="pending",
        )
        self.db.add(candidate)
        await self.db.commit()
        await self.db.refresh(candidate)
        return candidate

    async def create_candidates_batch(
        self,
        candidates: list[ActiveLearningCandidateCreate],
    ) -> list[ActiveLearningCandidate]:
        """Create multiple active learning candidates."""
        db_candidates = []
        for data in candidates:
            candidate = ActiveLearningCandidate(
                sample_id=data.sample_id,
                media_type=data.media_type,
                source=data.source,
                selection_reason=data.selection_reason,
                confidence_score=data.confidence_score,
                disagreement_score=data.disagreement_score,
                priority=data.priority,
                status="pending",
            )
            self.db.add(candidate)
            db_candidates.append(candidate)

        await self.db.commit()
        for candidate in db_candidates:
            await self.db.refresh(candidate)
        return db_candidates

    async def get_candidate(self, candidate_id: str) -> ActiveLearningCandidate | None:
        """Get an active learning candidate by ID."""
        query = select(ActiveLearningCandidate).where(ActiveLearningCandidate.id == candidate_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_candidates(
        self,
        status: str | None = None,
        selection_reason: str | None = None,
        media_type: str | None = None,
        min_priority: int | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ActiveLearningCandidate]:
        """List active learning candidates with filters."""
        query = select(ActiveLearningCandidate)
        if status:
            query = query.where(ActiveLearningCandidate.status == status)
        if selection_reason:
            query = query.where(ActiveLearningCandidate.selection_reason == selection_reason)
        if media_type:
            query = query.where(ActiveLearningCandidate.media_type == media_type)
        if min_priority is not None:
            query = query.where(ActiveLearningCandidate.priority >= min_priority)
        query = (
            query.order_by(
                ActiveLearningCandidate.priority.desc(),
                ActiveLearningCandidate.created_at,
            )
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ─── Annotation Workflow ───────────────────────────────────────────────

    async def annotate_candidate(
        self,
        candidate_id: str,
        annotation: ActiveLearningAnnotation,
        annotator_id: str,
    ) -> ActiveLearningCandidate:
        """Annotate an active learning candidate."""
        candidate = await self.get_candidate(candidate_id)
        if not candidate:
            raise ValueError(f"Active learning candidate {candidate_id} not found")

        if candidate.status == "annotated":
            raise ValueError(f"Candidate {candidate_id} is already annotated")

        candidate.status = "annotated"
        candidate.annotation = json.dumps(
            {
                "label": annotation.label,
                "confidence": annotation.confidence,
                "notes": annotation.notes,
            }
        )
        candidate.annotated_by = annotator_id
        candidate.annotated_at = datetime.now(UTC)

        await self.db.commit()
        await self.db.refresh(candidate)
        return candidate

    async def skip_candidate(
        self,
        candidate_id: str,
        reason: str | None = None,
    ) -> ActiveLearningCandidate:
        """Skip an active learning candidate."""
        candidate = await self.get_candidate(candidate_id)
        if not candidate:
            raise ValueError(f"Active learning candidate {candidate_id} not found")

        candidate.status = "skipped"
        if reason:
            candidate.annotation = json.dumps({"skip_reason": reason})

        await self.db.commit()
        await self.db.refresh(candidate)
        return candidate

    # ─── Selection Strategies ──────────────────────────────────────────────

    async def get_low_confidence_samples(
        self,
        threshold: float = 0.5,
        limit: int = 20,
    ) -> list[ActiveLearningCandidate]:
        """Get samples with confidence below threshold."""
        query = (
            select(ActiveLearningCandidate)
            .where(
                ActiveLearningCandidate.status == "pending",
                ActiveLearningCandidate.selection_reason == "low_confidence",
                ActiveLearningCandidate.confidence_score < threshold,
            )
            .order_by(ActiveLearningCandidate.confidence_score.asc())
            .limit(limit)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_disagreement_samples(
        self,
        min_disagreement: float = 0.3,
        limit: int = 20,
    ) -> list[ActiveLearningCandidate]:
        """Get samples with high disagreement scores."""
        query = (
            select(ActiveLearningCandidate)
            .where(
                ActiveLearningCandidate.status == "pending",
                ActiveLearningCandidate.selection_reason == "disagreement",
                ActiveLearningCandidate.disagreement_score >= min_disagreement,
            )
            .order_by(ActiveLearningCandidate.disagreement_score.desc())
            .limit(limit)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_priority_samples(
        self,
        limit: int = 20,
    ) -> list[ActiveLearningCandidate]:
        """Get highest priority samples for annotation."""
        query = (
            select(ActiveLearningCandidate)
            .where(ActiveLearningCandidate.status == "pending")
            .order_by(ActiveLearningCandidate.priority.desc())
            .limit(limit)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ─── Statistics ────────────────────────────────────────────────────────

    async def get_statistics(self) -> dict[str, Any]:
        """Get statistics about active learning candidates."""
        # Count by status
        status_counts = await self._count_by_status()
        # Count by selection reason
        reason_counts = await self._count_by_reason()
        # Average confidence and disagreement scores
        avg_scores = await self._get_average_scores()

        return {
            "total_candidates": sum(status_counts.values()),
            "by_status": status_counts,
            "by_reason": reason_counts,
            "average_scores": avg_scores,
            "annotation_rate": (
                status_counts.get("annotated", 0) / sum(status_counts.values()) * 100
                if sum(status_counts.values()) > 0
                else 0.0
            ),
        }

    async def _count_by_status(self) -> dict[str, int]:
        """Count candidates by status."""
        query = select(
            ActiveLearningCandidate.status,
            func.count(ActiveLearningCandidate.id),
        ).group_by(ActiveLearningCandidate.status)
        result = await self.db.execute(query)
        return dict(cast(Iterable[tuple[str, int]], result.all()))

    async def _count_by_reason(self) -> dict[str, int]:
        """Count candidates by selection reason."""
        query = select(
            ActiveLearningCandidate.selection_reason,
            func.count(ActiveLearningCandidate.id),
        ).group_by(ActiveLearningCandidate.selection_reason)
        result = await self.db.execute(query)
        return dict(cast(Iterable[tuple[str, int]], result.all()))

    async def _get_average_scores(self) -> dict[str, float]:
        """Get average confidence and disagreement scores."""
        query = select(
            func.avg(ActiveLearningCandidate.confidence_score),
            func.avg(ActiveLearningCandidate.disagreement_score),
        ).where(ActiveLearningCandidate.status == "pending")
        result = await self.db.execute(query)
        avg_confidence, avg_disagreement = result.one()
        return {
            "confidence": round(float(avg_confidence or 0), 4),
            "disagreement": round(float(avg_disagreement or 0), 4),
        }
