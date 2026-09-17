"""Corpus Intelligence Service - Orchestrates the full corpus pipeline.

Pipeline:
  Incoming media
  → ingestion
  → preprocessing
  → metadata extraction
  → validation
  → quality assessment
  → duplicate detection
  → corpus candidate
  → review/approval
  → corpus
  → dataset version
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.all_models import MediaAsset, MediaMetadata
from app.models.corpus_intelligence import (
    CorpusAuditAction,
    CorpusItemExtended,
    CorpusItemStatus,
    DatasetVersionExtended,
    DuplicateType,
)
from app.services.corpus_audit import CorpusAuditService
from app.services.dataset_versioning import DatasetVersioningService
from app.services.duplicate_detection import DuplicateDetectionService, DuplicateResult
from app.services.quality_pipeline import QualityPipeline

logger = logging.getLogger(__name__)

PIPELINE_VERSION = "1.0.0"

# Quality thresholds for training eligibility
TRAINING_ELIGIBILITY_MIN_QUALITY = 0.6
TRAINING_ELIGIBLE_STATUSES = {CorpusItemStatus.VALIDATED.value, CorpusItemStatus.APPROVED.value}


class CorpusIntelligenceService:
    """High-level service for the corpus intelligence layer.

    Coordinates ingestion, preprocessing, quality assessment,
    duplicate detection, review workflow, and dataset versioning.
    """

    def __init__(
        self,
        quality_pipeline: QualityPipeline | None = None,
        duplicate_service: DuplicateDetectionService | None = None,
        audit_service: CorpusAuditService | None = None,
        versioning_service: DatasetVersioningService | None = None,
    ):
        self.quality = quality_pipeline or QualityPipeline()
        self.duplicates = duplicate_service or DuplicateDetectionService()
        self.audit = audit_service or CorpusAuditService()
        self.versioning = versioning_service or DatasetVersioningService()

    # ------------------------------------------------------------------
    # INGESTION
    # ------------------------------------------------------------------

    async def ingest(
        self,
        media_asset_id: str,
        source: str,
        source_id: str | None = None,
        language: str = "en",
        title: str | None = None,
        label: str | None = None,
        label_confidence: float | None = None,
        consent_status: str | None = None,
        license_type: str | None = None,
        created_by: str | None = None,
        db: AsyncSession | None = None,
    ) -> CorpusItemExtended:
        """Ingest a media asset into the corpus as a new corpus item.

        This is the entry point for new content into the system.
        """
        if db is None:
            raise ValueError("Database session required")

        # Fetch the media asset
        asset_result = await db.execute(select(MediaAsset).where(MediaAsset.id == media_asset_id))
        asset = asset_result.scalar_one_or_none()
        if asset is None:
            raise ValueError(f"Media asset {media_asset_id} not found")

        # Create the corpus item
        item = CorpusItemExtended(
            media_asset_id=media_asset_id,
            media_type=asset.media_type,
            source=source,
            source_id=source_id,
            original_filename=asset.original_filename,
            content_hash=asset.sha256,
            mime_type=asset.mime_type,
            file_size_bytes=asset.file_size,
            language=language,
            title=title or asset.original_filename,
            label=label,
            label_confidence=label_confidence,
            status=CorpusItemStatus.PENDING.value,
            consent_status=consent_status,
            license_type=license_type,
            ingestion_pipeline_version=PIPELINE_VERSION,
            created_by=created_by,
        )
        db.add(item)
        await db.flush()

        # Record audit event
        await self.audit.record_event(
            corpus_item_id=item.id,
            action=CorpusAuditAction.UPLOADED,
            new_status=CorpusItemStatus.PENDING.value,
            performed_by=created_by,
            details=f"Ingested from source '{source}'",
            db=db,
        )

        return item

    # ------------------------------------------------------------------
    # PREPROCESSING
    # ------------------------------------------------------------------

    async def preprocess(self, item_id: str, db: AsyncSession | None = None) -> CorpusItemExtended:
        """Run preprocessing on a corpus item.

        Extracts metadata, normalizes content, and prepares for quality checks.
        """
        if db is None:
            raise ValueError("Database session required")

        item = await self._get_item(item_id, db)
        if item is None:
            raise ValueError(f"Corpus item {item_id} not found")

        # Transition to preprocessing
        await self.audit.transition_status(item, CorpusItemStatus.PREPROCESSING.value, db=db)

        # Extract metadata from media asset if available
        if item.media_asset_id:
            await self._extract_metadata(item, db)

        # Set preprocessing version
        item.preprocessing_version = PIPELINE_VERSION

        await db.commit()
        return item

    async def _extract_metadata(self, item: CorpusItemExtended, db: AsyncSession) -> None:
        """Extract and populate metadata from the media asset."""
        if item.media_asset_id is None:
            return

        meta_result = await db.execute(select(MediaMetadata).where(MediaMetadata.media_asset_id == item.media_asset_id))
        meta = meta_result.scalar_one_or_none()

        if meta and meta.language_detected:
            # Update language if detected differs and none was set
            if item.language == "en" and meta.language_detected != "en":
                item.language = meta.language_detected

    # ------------------------------------------------------------------
    # QUALITY ASSESSMENT
    # ------------------------------------------------------------------

    async def assess_quality(self, item_id: str, db: AsyncSession | None = None) -> CorpusItemExtended:
        """Run the full quality pipeline on a corpus item."""
        if db is None:
            raise ValueError("Database session required")

        item = await self._get_item(item_id, db)
        if item is None:
            raise ValueError(f"Corpus item {item_id} not found")

        # Transition to quality check
        await self.audit.transition_status(item, CorpusItemStatus.QUALITY_CHECK.value, db=db)

        # Run quality pipeline
        assessment = await self.quality.assess(item, db)
        await self.quality.persist_results(item, assessment, db)

        # Transition based on quality result
        if assessment.status == "failed":
            await self.audit.transition_status(
                item,
                CorpusItemStatus.QUARANTINED.value,
                details=f"Quality score: {assessment.overall_score}, failed checks: {assessment.failed}",
                db=db,
            )
        elif assessment.status == "passed":
            await self.audit.transition_status(
                item,
                CorpusItemStatus.VALIDATED.value,
                details=f"Quality score: {assessment.overall_score}",
                db=db,
            )
        else:
            # warning status: move to validated with notes
            await self.audit.transition_status(
                item,
                CorpusItemStatus.VALIDATED.value,
                details=f"Quality score: {assessment.overall_score}, warnings: {assessment.warned}",
                db=db,
            )

        # Auto-set training eligibility based on quality and status
        self._update_training_eligibility(item)

        await db.commit()
        return item

    def _update_training_eligibility(self, item: CorpusItemExtended) -> None:
        """Update training eligibility based on quality score and status."""
        if item.status in TRAINING_ELIGIBLE_STATUSES and item.quality_score is not None:
            if item.quality_score >= TRAINING_ELIGIBILITY_MIN_QUALITY and item.quality_status != "failed":
                item.training_eligible = True
                item.training_eligibility_reason = f"Quality score {item.quality_score:.3f} meets threshold"
            else:
                item.training_eligible = False
                item.training_eligibility_reason = f"Quality score {item.quality_score:.3f} below threshold"

    # ------------------------------------------------------------------
    # DUPLICATE DETECTION
    # ------------------------------------------------------------------

    async def detect_duplicates(self, item_id: str, db: AsyncSession | None = None) -> DuplicateResult:
        """Check for exact and near-duplicates of a corpus item."""
        if db is None:
            raise ValueError("Database session required")

        item = await self._get_item(item_id, db)
        if item is None:
            raise ValueError(f"Corpus item {item_id} not found")

        # Check exact duplicate
        exact_result = await self.duplicates.check_exact_duplicate(
            content_hash=item.content_hash,
            exclude_item_id=item.id,
            db=db,
        )

        if exact_result.is_duplicate:
            await self.duplicates.record_duplicate(
                item_id_a=item.id,
                item_id_b=exact_result.duplicate_of_id or "",
                duplicate_type=DuplicateType.EXACT,
                similarity_score=exact_result.similarity_score,
                detected_by="hash_comparison",
                details=exact_result.details,
                db=db,
            )

            await self.audit.record_event(
                corpus_item_id=item.id,
                action=CorpusAuditAction.DUPLICATE_DETECTED,
                details=exact_result.details,
                db=db,
            )

            # Quarantine if exact duplicate found
            if item.status not in (
                CorpusItemStatus.QUARANTINED.value,
                CorpusItemStatus.REJECTED.value,
                CorpusItemStatus.IN_DATASET.value,
            ):
                await self.audit.transition_status(
                    item,
                    CorpusItemStatus.QUARANTINED.value,
                    details=f"Exact duplicate detected: {exact_result.details}",
                    db=db,
                )

        return exact_result

    # ------------------------------------------------------------------
    # QUARANTINE
    # ------------------------------------------------------------------

    async def quarantine_item(
        self,
        item_id: str,
        reason: str,
        performed_by: str | None = None,
        db: AsyncSession | None = None,
    ) -> CorpusItemExtended:
        """Quarantine a corpus item with a reason.

        Available from PENDING, INGESTING, PREPROCESSING, QUALITY_CHECK,
        or VALIDATED states.
        """
        if db is None:
            raise ValueError("Database session required")

        item = await self._get_item(item_id, db)
        if item is None:
            raise ValueError(f"Corpus item {item_id} not found")

        success = await self.audit.transition_status(
            item,
            CorpusItemStatus.QUARANTINED.value,
            performed_by=performed_by,
            details=reason,
            db=db,
        )
        if not success:
            raise ValueError(f"Cannot quarantine item in status '{item.status}'")

        await db.commit()
        await db.refresh(item)
        return item

    async def release_from_quarantine(
        self,
        item_id: str,
        performed_by: str | None = None,
        db: AsyncSession | None = None,
    ) -> CorpusItemExtended:
        """Release a quarantined item back to PENDING for re-evaluation."""
        if db is None:
            raise ValueError("Database session required")

        item = await self._get_item(item_id, db)
        if item is None:
            raise ValueError(f"Corpus item {item_id} not found")

        success = await self.audit.transition_status(
            item,
            CorpusItemStatus.PENDING.value,
            performed_by=performed_by,
            details="Released from quarantine for re-evaluation",
            db=db,
        )
        if not success:
            raise ValueError(f"Cannot release item from quarantine (status='{item.status}')")

        await db.commit()
        await db.refresh(item)
        return item

    # ------------------------------------------------------------------
    # FULL PIPELINE
    # ------------------------------------------------------------------

    async def run_full_pipeline(self, item_id: str, db: AsyncSession | None = None) -> dict[str, Any]:
        """Run the complete ingestion → validation pipeline on a corpus item.

        Returns a summary of all pipeline stages.
        """
        if db is None:
            raise ValueError("Database session required")

        summary: dict[str, Any] = {"item_id": item_id, "stages": {}}

        current = await self._get_item(item_id, db)
        if current is None:
            raise ValueError(f"Corpus item {item_id} not found")
        if current.status == CorpusItemStatus.PENDING.value:
            if not await self.audit.transition_status(
                current,
                CorpusItemStatus.INGESTING.value,
                details="Automatic corpus eligibility evaluation started",
                db=db,
            ):
                raise ValueError(f"Cannot start corpus pipeline in status '{current.status}'")
            await db.flush()

        # 1. Preprocessing
        try:
            item = await self.preprocess(item_id, db)
            summary["stages"]["preprocessing"] = {"status": "completed"}
        except Exception as e:
            summary["stages"]["preprocessing"] = {"status": "failed", "error": str(e)}
            return summary

        # 2. Quality assessment
        try:
            item = await self.assess_quality(item_id, db)
            summary["stages"]["quality"] = {
                "status": "completed",
                "quality_score": item.quality_score,
                "quality_status": item.quality_status,
            }
        except Exception as e:
            summary["stages"]["quality"] = {"status": "failed", "error": str(e)}
            return summary

        # 3. Duplicate detection
        try:
            dup_result = await self.detect_duplicates(item_id, db)
            summary["stages"]["duplicates"] = {
                "status": "completed",
                "is_duplicate": dup_result.is_duplicate,
                "duplicate_type": dup_result.duplicate_type.value if dup_result.duplicate_type else None,
            }
        except Exception as e:
            summary["stages"]["duplicates"] = {"status": "failed", "error": str(e)}

        # 4. Training eligibility
        summary["stages"]["training_eligibility"] = {
            "eligible": item.training_eligible,
            "reason": item.training_eligibility_reason,
        }

        summary["final_status"] = item.status
        return summary

    # ------------------------------------------------------------------
    # REVIEW WORKFLOW
    # ------------------------------------------------------------------

    async def approve_item(
        self, item_id: str, reviewer_id: str, notes: str | None = None, db: AsyncSession | None = None
    ) -> CorpusItemExtended:
        """Approve a corpus item for inclusion in datasets."""
        if db is None:
            raise ValueError("Database session required")

        item = await self._get_item(item_id, db)
        if item is None:
            raise ValueError(f"Corpus item {item_id} not found")

        item.review_notes = notes
        item.verification_status = "verified"
        item.verified_by = reviewer_id

        success = await self.audit.transition_status(
            item,
            CorpusItemStatus.APPROVED.value,
            performed_by=reviewer_id,
            details=notes,
            db=db,
        )
        if not success:
            raise ValueError(f"Cannot approve item in status '{item.status}'")

        # Record REVIEWED audit event
        await self.audit.record_event(
            corpus_item_id=item.id,
            action=CorpusAuditAction.REVIEWED,
            previous_status=CorpusItemStatus.VALIDATED.value,
            new_status=CorpusItemStatus.APPROVED.value,
            performed_by=reviewer_id,
            details=f"Approved: {notes}" if notes else "Approved",
            db=db,
        )

        # Update training eligibility after approval
        self._update_training_eligibility(item)

        await db.commit()
        return item

    async def reject_item(
        self, item_id: str, reviewer_id: str, notes: str | None = None, db: AsyncSession | None = None
    ) -> CorpusItemExtended:
        """Reject a corpus item."""
        if db is None:
            raise ValueError("Database session required")

        item = await self._get_item(item_id, db)
        if item is None:
            raise ValueError(f"Corpus item {item_id} not found")

        item.review_notes = notes

        success = await self.audit.transition_status(
            item,
            CorpusItemStatus.REJECTED.value,
            performed_by=reviewer_id,
            details=notes,
            db=db,
        )
        if not success:
            raise ValueError(f"Cannot reject item in status '{item.status}'")

        # Record REVIEWED audit event
        await self.audit.record_event(
            corpus_item_id=item.id,
            action=CorpusAuditAction.REVIEWED,
            previous_status=item.status,
            new_status=CorpusItemStatus.REJECTED.value,
            performed_by=reviewer_id,
            details=f"Rejected: {notes}" if notes else "Rejected",
            db=db,
        )

        # Items that are rejected are not training eligible
        item.training_eligible = False
        item.training_eligibility_reason = "Rejected by reviewer"

        await db.commit()
        return item

    # ------------------------------------------------------------------
    # BATCH OPERATIONS
    # ------------------------------------------------------------------

    async def batch_approve(
        self,
        item_ids: list[str],
        reviewer_id: str,
        notes: str | None = None,
        db: AsyncSession | None = None,
    ) -> dict[str, Any]:
        """Batch approve multiple corpus items.

        Returns a summary of successes and failures.
        """
        if db is None:
            raise ValueError("Database session required")

        results: dict[str, Any] = {"approved": [], "failed": []}
        for item_id in item_ids:
            try:
                await self.approve_item(item_id, reviewer_id, notes, db)
                results["approved"].append(item_id)
            except ValueError as e:
                results["failed"].append({"item_id": item_id, "error": str(e)})

        return results

    async def batch_reject(
        self,
        item_ids: list[str],
        reviewer_id: str,
        notes: str | None = None,
        db: AsyncSession | None = None,
    ) -> dict[str, Any]:
        """Batch reject multiple corpus items.

        Returns a summary of successes and failures.
        """
        if db is None:
            raise ValueError("Database session required")

        results: dict[str, Any] = {"rejected": [], "failed": []}
        for item_id in item_ids:
            try:
                await self.reject_item(item_id, reviewer_id, notes, db)
                results["rejected"].append(item_id)
            except ValueError as e:
                results["failed"].append({"item_id": item_id, "error": str(e)})

        return results

    async def batch_quarantine(
        self,
        item_ids: list[str],
        reason: str,
        performed_by: str | None = None,
        db: AsyncSession | None = None,
    ) -> dict[str, Any]:
        """Batch quarantine multiple corpus items."""
        if db is None:
            raise ValueError("Database session required")

        results: dict[str, Any] = {"quarantined": [], "failed": []}
        for item_id in item_ids:
            try:
                await self.quarantine_item(item_id, reason, performed_by, db)
                results["quarantined"].append(item_id)
            except ValueError as e:
                results["failed"].append({"item_id": item_id, "error": str(e)})

        return results

    # ------------------------------------------------------------------
    # MARK USED IN TRAINING
    # ------------------------------------------------------------------

    async def mark_used_in_training(
        self,
        item_ids: list[str],
        performed_by: str | None = None,
        db: AsyncSession | None = None,
    ) -> None:
        """Record that corpus items were used in a training run.

        Generates USED_IN_TRAINING audit events for each item.
        """
        if db is None:
            raise ValueError("Database session required")

        for item_id in item_ids:
            item = await self._get_item(item_id, db)
            if item is not None:
                await self.audit.record_event(
                    corpus_item_id=item_id,
                    action=CorpusAuditAction.USED_IN_TRAINING,
                    performed_by=performed_by,
                    details="Used in training run",
                    db=db,
                )

    # ------------------------------------------------------------------
    # DASHBOARD
    # ------------------------------------------------------------------

    async def get_dashboard(self, db: AsyncSession | None = None) -> dict[str, Any]:
        """Get corpus dashboard statistics."""
        if db is None:
            return self._empty_dashboard()

        # Total items
        total_result = await db.execute(select(func.count(CorpusItemExtended.id)))
        total = total_result.scalar() or 0

        # By media type
        type_result = await db.execute(
            select(CorpusItemExtended.media_type, func.count(CorpusItemExtended.id)).group_by(
                CorpusItemExtended.media_type
            )
        )
        by_media_type = {row[0]: row[1] for row in type_result.all()}

        # By language
        lang_result = await db.execute(
            select(CorpusItemExtended.language, func.count(CorpusItemExtended.id)).group_by(CorpusItemExtended.language)
        )
        by_language = {row[0]: row[1] for row in lang_result.all()}

        # By quality status
        quality_result = await db.execute(
            select(CorpusItemExtended.quality_status, func.count(CorpusItemExtended.id)).group_by(
                CorpusItemExtended.quality_status
            )
        )
        by_quality = {row[0]: row[1] for row in quality_result.all()}

        # By lifecycle status
        status_result = await db.execute(
            select(CorpusItemExtended.status, func.count(CorpusItemExtended.id)).group_by(CorpusItemExtended.status)
        )
        by_status = {row[0]: row[1] for row in status_result.all()}

        # Pending review
        pending_result = await db.execute(
            select(func.count(CorpusItemExtended.id)).where(
                CorpusItemExtended.status == CorpusItemStatus.VALIDATED.value
            )
        )
        pending_review = pending_result.scalar() or 0

        # Training eligible
        eligible_result = await db.execute(
            select(func.count(CorpusItemExtended.id)).where(CorpusItemExtended.training_eligible == True)  # noqa: E712
        )
        training_eligible = eligible_result.scalar() or 0

        # Dataset versions
        versions_result = await db.execute(select(func.count(DatasetVersionExtended.id)))
        dataset_versions = versions_result.scalar() or 0

        # Recent ingestions (last 24h)
        from datetime import UTC, datetime, timedelta

        cutoff = datetime.now(UTC) - timedelta(hours=24)
        recent_result = await db.execute(
            select(func.count(CorpusItemExtended.id)).where(CorpusItemExtended.created_at >= cutoff)
        )
        recent_ingestions = recent_result.scalar() or 0

        # Average quality score
        avg_result = await db.execute(
            select(func.avg(CorpusItemExtended.quality_score)).where(CorpusItemExtended.quality_score.isnot(None))
        )
        avg_quality = avg_result.scalar()

        # Quarantined count
        quarantined_result = await db.execute(
            select(func.count(CorpusItemExtended.id)).where(
                CorpusItemExtended.status == CorpusItemStatus.QUARANTINED.value
            )
        )
        quarantined = quarantined_result.scalar() or 0

        return {
            "total_items": total,
            "by_media_type": by_media_type,
            "by_language": by_language,
            "by_quality_status": by_quality,
            "by_status": by_status,
            "pending_review": pending_review,
            "training_eligible": training_eligible,
            "dataset_versions": dataset_versions,
            "recent_ingestions_24h": recent_ingestions,
            "avg_quality_score": round(float(avg_quality), 4) if avg_quality else None,
            "quarantined": quarantined,
        }

    def _empty_dashboard(self) -> dict[str, Any]:
        return {
            "total_items": 0,
            "by_media_type": {},
            "by_language": {},
            "by_quality_status": {},
            "by_status": {},
            "pending_review": 0,
            "training_eligible": 0,
            "dataset_versions": 0,
            "recent_ingestions_24h": 0,
            "avg_quality_score": None,
            "quarantined": 0,
        }

    # ------------------------------------------------------------------
    # QUERY HELPERS
    # ------------------------------------------------------------------

    async def get_item(self, item_id: str, db: AsyncSession | None = None) -> CorpusItemExtended | None:
        """Get a corpus item by ID."""
        if db is None:
            return None
        return await self._get_item(item_id, db)

    async def list_items(
        self,
        db: AsyncSession | None = None,
        media_type: str | None = None,
        language: str | None = None,
        status: str | None = None,
        quality_status: str | None = None,
        source: str | None = None,
        search: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[CorpusItemExtended], int]:
        """List corpus items with filtering and pagination."""
        if db is None:
            return [], 0

        query = select(CorpusItemExtended)
        count_query = select(func.count(CorpusItemExtended.id))

        if media_type:
            query = query.where(CorpusItemExtended.media_type == media_type)
            count_query = count_query.where(CorpusItemExtended.media_type == media_type)
        if language:
            query = query.where(CorpusItemExtended.language == language)
            count_query = count_query.where(CorpusItemExtended.language == language)
        if status:
            query = query.where(CorpusItemExtended.status == status)
            count_query = count_query.where(CorpusItemExtended.status == status)
        if quality_status:
            query = query.where(CorpusItemExtended.quality_status == quality_status)
            count_query = count_query.where(CorpusItemExtended.quality_status == quality_status)
        if source:
            query = query.where(CorpusItemExtended.source == source)
            count_query = count_query.where(CorpusItemExtended.source == source)
        if search:
            search_filter = f"%{search}%"
            query = query.where(CorpusItemExtended.title.ilike(search_filter))
            count_query = count_query.where(CorpusItemExtended.title.ilike(search_filter))

        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0

        query = query.order_by(CorpusItemExtended.created_at.desc()).offset(offset).limit(limit)
        result = await db.execute(query)
        items = list(result.scalars().all())

        return items, total

    async def _get_item(self, item_id: str, db: AsyncSession) -> CorpusItemExtended | None:
        result = await db.execute(select(CorpusItemExtended).where(CorpusItemExtended.id == item_id))
        return result.scalar_one_or_none()
