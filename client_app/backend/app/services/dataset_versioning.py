"""Dataset Versioning - Immutable dataset versions with full provenance.

Every version is a snapshot that never mutates. Creating a new version
produces a new record; existing records are never modified.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.corpus_intelligence import (
    CorpusItemExtended,
    DatasetVersionExtended,
    DatasetVersionItemExt,
)

logger = logging.getLogger(__name__)

PREPROCESSING_VERSION = "1.0.0"
ANNOTATION_VERSION = "1.0.0"


@dataclass
class VersionStatistics:
    """Aggregate statistics for a dataset version."""

    total_items: int
    by_media_type: dict[str, int]
    by_language: dict[str, int]
    by_quality_status: dict[str, int]
    avg_quality_score: float | None
    annotation_coverage: float
    training_eligible_count: int

    def to_json(self) -> str:
        return json.dumps(
            {
                "total_items": self.total_items,
                "by_media_type": self.by_media_type,
                "by_language": self.by_language,
                "by_quality_status": self.by_quality_status,
                "avg_quality_score": self.avg_quality_score,
                "annotation_coverage": self.annotation_coverage,
                "training_eligible_count": self.training_eligible_count,
            }
        )


@dataclass
class ValidationResult:
    """Result of dataset version validation."""

    passed: bool
    checks_run: int
    checks_passed: int
    checks_failed: int
    issues: list[str]

    def to_json(self) -> str:
        return json.dumps(
            {
                "passed": self.passed,
                "checks_run": self.checks_run,
                "checks_passed": self.checks_passed,
                "checks_failed": self.checks_failed,
                "issues": self.issues,
            }
        )


class DatasetVersioningService:
    """Service for managing immutable dataset versions.

    Key principles:
    - Versions are immutable once created.
    - Each version records included items, statistics, and validation.
    - Checksums ensure integrity.
    """

    def __init__(self):
        self.preprocessing_version = PREPROCESSING_VERSION
        self.annotation_version = ANNOTATION_VERSION

    async def get_next_version(self, dataset_id: str, db: AsyncSession) -> str:
        """Compute the next version string for a dataset."""
        result = await db.execute(
            select(DatasetVersionExtended)
            .where(DatasetVersionExtended.dataset_id == dataset_id)
            .order_by(DatasetVersionExtended.created_at.desc())
            .limit(1)
        )
        latest = result.scalar_one_or_none()

        if latest is None:
            return "v1"

        try:
            current_num = int(latest.version.lstrip("v"))
            return f"v{current_num + 1}"
        except (ValueError, AttributeError):
            return f"{latest.version}-next"

    async def compute_statistics(self, corpus_item_ids: list[str], db: AsyncSession) -> VersionStatistics:
        """Compute aggregate statistics for a set of corpus items using GROUP BY queries."""
        if not corpus_item_ids:
            return VersionStatistics(
                total_items=0,
                by_media_type={},
                by_language={},
                by_quality_status={},
                avg_quality_score=None,
                annotation_coverage=0.0,
                training_eligible_count=0,
            )

        base_filter = CorpusItemExtended.id.in_(corpus_item_ids)

        # Total items
        total_result = await db.execute(select(func.count(CorpusItemExtended.id)).where(base_filter))
        total_items = total_result.scalar() or 0

        # By media type (GROUP BY)
        type_result = await db.execute(
            select(CorpusItemExtended.media_type, func.count(CorpusItemExtended.id))
            .where(base_filter)
            .group_by(CorpusItemExtended.media_type)
        )
        by_media_type = {row[0]: row[1] for row in type_result.all()}

        # By language (GROUP BY)
        lang_result = await db.execute(
            select(CorpusItemExtended.language, func.count(CorpusItemExtended.id))
            .where(base_filter)
            .group_by(CorpusItemExtended.language)
        )
        by_language = {row[0]: row[1] for row in lang_result.all()}

        # By quality status (GROUP BY)
        quality_result = await db.execute(
            select(CorpusItemExtended.quality_status, func.count(CorpusItemExtended.id))
            .where(base_filter)
            .group_by(CorpusItemExtended.quality_status)
        )
        by_quality_status = {row[0]: row[1] for row in quality_result.all()}

        # Average quality score
        avg_result = await db.execute(
            select(func.avg(CorpusItemExtended.quality_score))
            .where(base_filter)
            .where(CorpusItemExtended.quality_score.isnot(None))
        )
        avg_quality = avg_result.scalar()

        # Annotation coverage
        annotated_result = await db.execute(
            select(func.count(CorpusItemExtended.id))
            .where(base_filter)
            .where(CorpusItemExtended.annotation_status == "annotated")
        )
        annotated_count = annotated_result.scalar() or 0

        # Training eligible count
        eligible_result = await db.execute(
            select(func.count(CorpusItemExtended.id))
            .where(base_filter)
            .where(CorpusItemExtended.training_eligible == True)  # noqa: E712
        )
        training_eligible = eligible_result.scalar() or 0

        annotation_coverage = round(annotated_count / total_items, 4) if total_items > 0 else 0.0

        return VersionStatistics(
            total_items=total_items,
            by_media_type=by_media_type,
            by_language=by_language,
            by_quality_status=by_quality_status,
            avg_quality_score=round(float(avg_quality), 4) if avg_quality else None,
            annotation_coverage=annotation_coverage,
            training_eligible_count=training_eligible,
        )

    async def validate_dataset_version(self, corpus_item_ids: list[str], db: AsyncSession) -> ValidationResult:
        """Run validation checks on items proposed for a dataset version."""
        issues: list[str] = []
        checks_run = 0
        checks_passed = 0

        if not corpus_item_ids:
            return ValidationResult(
                passed=False,
                checks_run=1,
                checks_passed=0,
                checks_failed=1,
                issues=["No corpus items provided"],
            )

        result = await db.execute(select(CorpusItemExtended).where(CorpusItemExtended.id.in_(corpus_item_ids)))
        items = list(result.scalars().all())

        if len(items) != len(corpus_item_ids):
            missing = len(corpus_item_ids) - len(items)
            issues.append(f"{missing} corpus item(s) not found")
            checks_run += 1

        for item in items:
            checks_run += 1
            if item.status != "APPROVED":
                issues.append(f"Item {item.id} has status '{item.status}', expected 'APPROVED'")
            else:
                checks_passed += 1

            checks_run += 1
            if item.quality_status == "failed":
                issues.append(f"Item {item.id} failed quality checks")
            else:
                checks_passed += 1

        return ValidationResult(
            passed=len(issues) == 0,
            checks_run=checks_run,
            checks_passed=checks_passed,
            checks_failed=checks_run - checks_passed,
            issues=issues,
        )

    async def compute_checksum(self, corpus_item_ids: list[str], db: AsyncSession) -> str:
        """Compute a deterministic checksum for a set of corpus items."""
        result = await db.execute(
            select(CorpusItemExtended.content_hash, CorpusItemExtended.id)
            .where(CorpusItemExtended.id.in_(corpus_item_ids))
            .order_by(CorpusItemExtended.id)
        )
        rows = result.all()

        combined = "".join(f"{row[1]}:{row[0]}" for row in rows)
        return hashlib.sha256(combined.encode()).hexdigest()

    async def create_version(
        self,
        dataset_id: str,
        corpus_item_ids: list[str],
        description: str | None,
        created_by: str | None,
        db: AsyncSession,
    ) -> DatasetVersionExtended:
        """Create a new immutable dataset version.

        Steps:
        1. Validate all items are approved
        2. Compute statistics
        3. Compute checksum
        4. Create version record
        5. Link corpus items
        6. Seal the version
        7. Record audit events
        """
        # Validate
        validation = await self.validate_dataset_version(corpus_item_ids, db)
        if not validation.passed:
            raise ValueError(f"Dataset validation failed: {'; '.join(validation.issues)}")

        # Compute statistics
        stats = await self.compute_statistics(corpus_item_ids, db)

        # Compute checksum
        checksum = await self.compute_checksum(corpus_item_ids, db)

        # Get next version number
        version = await self.get_next_version(dataset_id, db)

        # Create version record (immutable)
        dv = DatasetVersionExtended(
            dataset_id=dataset_id,
            version=version,
            description=description,
            created_by=created_by,
            preprocessing_version=self.preprocessing_version,
            annotation_version=self.annotation_version,
            checksum=checksum,
            statistics=stats.to_json(),
            validation_results=validation.to_json(),
            is_sealed=False,
        )
        db.add(dv)
        await db.flush()

        # Link corpus items
        for item_id in corpus_item_ids:
            link = DatasetVersionItemExt(
                dataset_version_id=dv.id,
                corpus_item_id=item_id,
            )
            db.add(link)

        await db.flush()

        # Update corpus items status and record audit events
        from app.models.corpus_intelligence import CorpusAuditAction

        for item_id in corpus_item_ids:
            item_result = await db.execute(select(CorpusItemExtended).where(CorpusItemExtended.id == item_id))
            item = item_result.scalar_one_or_none()
            if item:
                old_status = item.status
                item.status = "IN_DATASET"

                # Record audit event for each item
                from app.services.corpus_audit import CorpusAuditService

                audit = CorpusAuditService()
                await audit.record_event(
                    corpus_item_id=item_id,
                    action=CorpusAuditAction.ADDED_TO_DATASET,
                    previous_status=old_status,
                    new_status="IN_DATASET",
                    performed_by=created_by,
                    details=f"Added to dataset version {version} (dataset: {dataset_id})",
                    db=db,
                )

        dv.is_sealed = True
        await db.commit()
        return dv

    async def get_version(self, version_id: str, db: AsyncSession) -> DatasetVersionExtended | None:
        """Get a dataset version by ID."""
        result = await db.execute(select(DatasetVersionExtended).where(DatasetVersionExtended.id == version_id))
        return result.scalar_one_or_none()

    async def get_version_items(
        self, version_id: str, db: AsyncSession, limit: int = 100, offset: int = 0
    ) -> list[CorpusItemExtended]:
        """Get corpus items in a dataset version with pagination."""
        result = await db.execute(
            select(CorpusItemExtended)
            .join(DatasetVersionItemExt, DatasetVersionItemExt.corpus_item_id == CorpusItemExtended.id)
            .where(DatasetVersionItemExt.dataset_version_id == version_id)
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_versions(
        self, dataset_id: str, db: AsyncSession, limit: int = 50, offset: int = 0
    ) -> list[DatasetVersionExtended]:
        """List versions for a dataset, newest first."""
        result = await db.execute(
            select(DatasetVersionExtended)
            .where(DatasetVersionExtended.dataset_id == dataset_id)
            .order_by(DatasetVersionExtended.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def diff_versions(self, version_id_a: str, version_id_b: str, db: AsyncSession) -> dict[str, Any]:
        """Compare two dataset versions and return differences."""
        items_a_result = await db.execute(
            select(DatasetVersionItemExt.corpus_item_id).where(DatasetVersionItemExt.dataset_version_id == version_id_a)
        )
        items_a = set(row[0] for row in items_a_result.all())

        items_b_result = await db.execute(
            select(DatasetVersionItemExt.corpus_item_id).where(DatasetVersionItemExt.dataset_version_id == version_id_b)
        )
        items_b = set(row[0] for row in items_b_result.all())

        added = items_b - items_a
        removed = items_a - items_b
        common = items_a & items_b

        # Get version metadata
        v_a = await self.get_version(version_id_a, db)
        v_b = await self.get_version(version_id_b, db)

        return {
            "version_a": {"id": version_id_a, "version": v_a.version if v_a else None, "item_count": len(items_a)},
            "version_b": {"id": version_id_b, "version": v_b.version if v_b else None, "item_count": len(items_b)},
            "added_count": len(added),
            "removed_count": len(removed),
            "common_count": len(common),
            "added_item_ids": sorted(added),
            "removed_item_ids": sorted(removed),
        }
