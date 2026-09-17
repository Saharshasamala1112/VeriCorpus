"""Corpus Audit Service - Tracks all corpus lifecycle transitions.

Every important corpus state change generates an audit event, providing
a complete, immutable audit trail.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.corpus_intelligence import (
    CorpusAuditAction,
    CorpusAuditEvent,
    CorpusItemExtended,
    CorpusItemStatus,
)

logger = logging.getLogger(__name__)

# Valid status transitions
VALID_TRANSITIONS: dict[str, list[str]] = {
    CorpusItemStatus.PENDING.value: [
        CorpusItemStatus.INGESTING.value,
        CorpusItemStatus.QUARANTINED.value,
        CorpusItemStatus.REJECTED.value,
    ],
    CorpusItemStatus.INGESTING.value: [
        CorpusItemStatus.PREPROCESSING.value,
        CorpusItemStatus.REJECTED.value,
    ],
    CorpusItemStatus.PREPROCESSING.value: [
        CorpusItemStatus.QUALITY_CHECK.value,
        CorpusItemStatus.QUARANTINED.value,
    ],
    CorpusItemStatus.QUALITY_CHECK.value: [
        CorpusItemStatus.VALIDATED.value,
        CorpusItemStatus.QUARANTINED.value,
        CorpusItemStatus.REJECTED.value,
    ],
    CorpusItemStatus.QUARANTINED.value: [
        CorpusItemStatus.VALIDATED.value,
        CorpusItemStatus.REJECTED.value,
        CorpusItemStatus.PENDING.value,
    ],
    CorpusItemStatus.VALIDATED.value: [
        CorpusItemStatus.APPROVED.value,
        CorpusItemStatus.REJECTED.value,
    ],
    CorpusItemStatus.APPROVED.value: [
        CorpusItemStatus.IN_DATASET.value,
        CorpusItemStatus.REJECTED.value,
    ],
    CorpusItemStatus.REJECTED.value: [
        CorpusItemStatus.PENDING.value,
    ],
    CorpusItemStatus.IN_DATASET.value: [],
}


def is_valid_transition(from_status: str, to_status: str) -> bool:
    """Check if a status transition is valid."""
    allowed = VALID_TRANSITIONS.get(from_status, [])
    return to_status in allowed


class CorpusAuditService:
    """Service for recording and querying corpus audit events."""

    async def record_event(
        self,
        corpus_item_id: str,
        action: CorpusAuditAction,
        previous_status: str | None = None,
        new_status: str | None = None,
        performed_by: str | None = None,
        details: str | None = None,
        ip_address: str | None = None,
        db: AsyncSession | None = None,
    ) -> CorpusAuditEvent | None:
        """Record a corpus audit event."""
        if db is None:
            return None

        event = CorpusAuditEvent(
            corpus_item_id=corpus_item_id,
            action=action.value,
            previous_status=previous_status,
            new_status=new_status,
            performed_by=performed_by,
            details=details,
            ip_address=ip_address,
        )
        db.add(event)
        await db.flush()
        logger.info(
            "Corpus audit: %s on item %s (%s -> %s)", action.value, corpus_item_id[:8], previous_status, new_status
        )
        return event

    async def transition_status(
        self,
        item: CorpusItemExtended,
        new_status: str,
        performed_by: str | None = None,
        details: str | None = None,
        db: AsyncSession | None = None,
    ) -> bool:
        """Transition a corpus item to a new status with validation and audit.

        Returns True if the transition was successful.
        """
        if db is None:
            return False

        old_status = item.status

        if not is_valid_transition(old_status, new_status):
            logger.warning(
                "Invalid transition: %s -> %s for item %s",
                old_status,
                new_status,
                item.id[:8],
            )
            return False

        item.status = new_status

        # Update timestamps based on transition
        from datetime import UTC, datetime

        if new_status == CorpusItemStatus.APPROVED.value:
            item.reviewed_at = datetime.now(UTC)
            if performed_by:
                item.reviewed_by = performed_by
        elif new_status == CorpusItemStatus.INGESTING.value:
            item.ingestion_timestamp = datetime.now(UTC)

        # Determine the audit action
        action_map: dict[str, CorpusAuditAction] = {
            CorpusItemStatus.INGESTING.value: CorpusAuditAction.INGESTED,
            CorpusItemStatus.PREPROCESSING.value: CorpusAuditAction.PREPROCESSED,
            CorpusItemStatus.QUALITY_CHECK.value: CorpusAuditAction.QUALITY_CHECKED,
            CorpusItemStatus.VALIDATED.value: CorpusAuditAction.VALIDATED,
            CorpusItemStatus.QUARANTINED.value: CorpusAuditAction.QUARANTINED,
            CorpusItemStatus.REJECTED.value: CorpusAuditAction.REJECTED,
            CorpusItemStatus.APPROVED.value: CorpusAuditAction.APPROVED,
            CorpusItemStatus.IN_DATASET.value: CorpusAuditAction.ADDED_TO_DATASET,
        }
        action = action_map.get(new_status, CorpusAuditAction.STATUS_CHANGED)

        await self.record_event(
            corpus_item_id=item.id,
            action=action,
            previous_status=old_status,
            new_status=new_status,
            performed_by=performed_by,
            details=details,
            db=db,
        )

        return True

    async def get_item_events(
        self, corpus_item_id: str, db: AsyncSession | None = None, limit: int = 100
    ) -> list[CorpusAuditEvent]:
        """Get audit events for a specific corpus item."""
        if db is None:
            return []

        result = await db.execute(
            select(CorpusAuditEvent)
            .where(CorpusAuditEvent.corpus_item_id == corpus_item_id)
            .order_by(CorpusAuditEvent.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_recent_events(
        self, db: AsyncSession | None = None, limit: int = 50, action_filter: str | None = None
    ) -> list[CorpusAuditEvent]:
        """Get recent audit events across all corpus items."""
        if db is None:
            return []

        query = select(CorpusAuditEvent)
        if action_filter:
            query = query.where(CorpusAuditEvent.action == action_filter)
        query = query.order_by(CorpusAuditEvent.created_at.desc()).limit(limit)

        result = await db.execute(query)
        return list(result.scalars().all())

    async def get_event_timeline(self, corpus_item_id: str, db: AsyncSession | None = None) -> list[dict[str, Any]]:
        """Get a chronological timeline of events for a corpus item."""
        events = await self.get_item_events(corpus_item_id, db, limit=1000)
        events.reverse()  # Oldest first

        return [
            {
                "timestamp": event.created_at.isoformat() if event.created_at else None,
                "action": event.action,
                "previous_status": event.previous_status,
                "new_status": event.new_status,
                "performed_by": event.performed_by,
                "details": event.details,
            }
            for event in events
        ]
