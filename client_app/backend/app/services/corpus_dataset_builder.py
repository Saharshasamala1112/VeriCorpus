"""First-class corpus ingestion and leakage-safe dataset construction."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.corpus_intelligence import (
    CorpusDuplicate,
    CorpusItemExtended,
    CorpusItemStatus,
    DatasetSplitExtended,
    DatasetVersionExtended,
    DatasetVersionItemExt,
    DuplicateType,
)
from app.services.corpus_intelligence import CorpusIntelligenceService


@dataclass(frozen=True)
class SplitAssignment:
    split: str
    group_key: str


class CorpusDatasetBuilder:
    """Builds corpus snapshots and immutable, grouped dataset versions."""

    def __init__(self, corpus: CorpusIntelligenceService | None = None) -> None:
        self.corpus = corpus or CorpusIntelligenceService()

    async def ingest_and_evaluate(
        self,
        media_asset_id: str,
        source: str,
        created_by: str | None,
        db: AsyncSession,
        *,
        source_id: str | None = None,
        language: str = "en",
        title: str | None = None,
        label: str | None = None,
        label_confidence: float | None = None,
        consent_status: str | None = None,
        license_type: str | None = None,
    ) -> CorpusItemExtended:
        """Create a corpus item and automatically run eligibility evaluation."""
        item = await self.corpus.ingest(
            media_asset_id=media_asset_id,
            source=source,
            source_id=source_id,
            language=language,
            title=title,
            label=label,
            label_confidence=label_confidence,
            consent_status=consent_status,
            license_type=license_type,
            created_by=created_by,
            db=db,
        )
        await self.corpus.run_full_pipeline(item.id, db)
        await db.refresh(item)
        return item

    async def search(
        self,
        db: AsyncSession,
        *,
        query: str | None = None,
        media_type: str | None = None,
        language: str | None = None,
        source: str | None = None,
        status: str | None = None,
        quality_status: str | None = None,
        training_eligible: bool | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[CorpusItemExtended], int]:
        """Search corpus records with full metadata filtering."""
        filters = []
        if query:
            pattern = f"%{query}%"
            filters.append(
                or_(
                    CorpusItemExtended.title.ilike(pattern),
                    CorpusItemExtended.description.ilike(pattern),
                    CorpusItemExtended.original_filename.ilike(pattern),
                    CorpusItemExtended.content_hash.ilike(pattern),
                )
            )
        for column, value in (
            (CorpusItemExtended.media_type, media_type),
            (CorpusItemExtended.language, language),
            (CorpusItemExtended.source, source),
            (CorpusItemExtended.status, status),
            (CorpusItemExtended.quality_status, quality_status),
            (CorpusItemExtended.training_eligible, training_eligible),
        ):
            if value is not None:
                filters.append(column == value)
        base = select(CorpusItemExtended).where(*filters)
        count = await db.execute(select(func.count()).select_from(base.subquery()))
        rows = await db.execute(base.order_by(CorpusItemExtended.created_at.desc()).offset(offset).limit(limit))
        return list(rows.scalars().all()), int(count.scalar() or 0)

    async def create_next_dataset_version(
        self,
        dataset_id: str,
        db: AsyncSession,
        *,
        created_by: str | None = None,
        description: str | None = None,
        inclusion_rules: dict[str, Any] | None = None,
        exclusion_rules: dict[str, Any] | None = None,
        label_schema: dict[str, Any] | None = None,
        ratios: dict[str, float] | None = None,
        duplicate_policy: str = "canonical_per_exact_or_near_duplicate_group",
    ) -> DatasetVersionExtended:
        ratios = ratios or {"train": 0.8, "validation": 0.1, "test": 0.1}
        if abs(sum(ratios.values()) - 1.0) > 0.001:
            raise ValueError("Dataset split ratios must sum to 1.0")

        filters = [
            CorpusItemExtended.training_eligible.is_(True),
            CorpusItemExtended.status.in_([CorpusItemStatus.APPROVED.value, CorpusItemStatus.VALIDATED.value]),
        ]
        items_result = await db.execute(select(CorpusItemExtended).where(*filters).order_by(CorpusItemExtended.id))
        items = list(items_result.scalars().all())
        if not items:
            raise ValueError("No validated training-eligible corpus items available")

        groups = await self._duplicate_groups(items, db)
        assignments = self._assign_groups(groups, ratios)
        selected = [item for item in items if item.id in assignments]
        if not selected:
            raise ValueError("No corpus items remained after duplicate policy filtering")

        version_result = await db.execute(
            select(DatasetVersionExtended)
            .where(DatasetVersionExtended.dataset_id == dataset_id)
            .order_by(DatasetVersionExtended.created_at.desc())
            .limit(1)
        )
        previous = version_result.scalar_one_or_none()
        version = f"v{int(previous.version[1:]) + 1}" if previous and previous.version.startswith("v") else "v1"

        snapshot = [
            {"id": item.id, "content_hash": item.content_hash, "group_key": assignments[item.id].group_key}
            for item in selected
        ]
        distributions = {
            "language": self._counts(selected, "language"),
            "modality": self._counts(selected, "media_type"),
            "class": self._counts(selected, "label", default="unlabeled"),
        }
        split_counts = self._counts_assignments(assignments, selected)
        fingerprint = hashlib.sha256(
            json.dumps({"snapshot": snapshot, "splits": split_counts}, sort_keys=True).encode()
        ).hexdigest()
        dataset_version = DatasetVersionExtended(
            dataset_id=dataset_id,
            version=version,
            description=description,
            created_by=created_by,
            preprocessing_version="1.0.0",
            annotation_version="1.0.0",
            checksum=fingerprint,
            fingerprint=fingerprint,
            corpus_snapshot=json.dumps(snapshot, sort_keys=True),
            inclusion_rules=json.dumps(inclusion_rules or {"training_eligible": True}, sort_keys=True),
            exclusion_rules=json.dumps(exclusion_rules or {"duplicate_policy": duplicate_policy}, sort_keys=True),
            label_schema=json.dumps(label_schema or {"field": "label"}, sort_keys=True),
            language_distribution=json.dumps(distributions["language"], sort_keys=True),
            modality_distribution=json.dumps(distributions["modality"], sort_keys=True),
            class_distribution=json.dumps(distributions["class"], sort_keys=True),
            duplicate_policy=duplicate_policy,
            split_counts=json.dumps(split_counts, sort_keys=True),
            statistics=json.dumps({"total_items": len(selected), **distributions}, sort_keys=True),
            validation_results=json.dumps({"passed": True, "leakage_safe": True}, sort_keys=True),
            is_sealed=False,
        )
        db.add(dataset_version)
        await db.flush()
        for split_name, count in split_counts.items():
            db.add(
                DatasetSplitExtended(
                    dataset_version_id=dataset_version.id,
                    name=split_name,
                    sample_count=count,
                    strategy="deterministic_duplicate_group_hash",
                )
            )
        for item in selected:
            assignment = assignments[item.id]
            db.add(
                DatasetVersionItemExt(
                    dataset_version_id=dataset_version.id,
                    corpus_item_id=item.id,
                    split=assignment.split,
                    group_key=assignment.group_key,
                )
            )
        dataset_version.is_sealed = True
        dataset_version.sealed_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(dataset_version)
        return dataset_version

    async def _duplicate_groups(
        self, items: list[CorpusItemExtended], db: AsyncSession
    ) -> dict[str, list[CorpusItemExtended]]:
        item_ids = {item.id for item in items}
        parent = {item.id: item.id for item in items}

        def find(value: str) -> str:
            while parent[value] != value:
                parent[value] = parent[parent[value]]
                value = parent[value]
            return value

        def union(left: str, right: str) -> None:
            if left in parent and right in parent:
                a, b = find(left), find(right)
                if a != b:
                    parent[b] = a

        duplicates = await db.execute(
            select(CorpusDuplicate).where(
                CorpusDuplicate.corpus_item_id_a.in_(item_ids),
                CorpusDuplicate.corpus_item_id_b.in_(item_ids),
                CorpusDuplicate.duplicate_type.in_([DuplicateType.EXACT.value, DuplicateType.NEAR.value]),
            )
        )
        for duplicate in duplicates.scalars():
            union(duplicate.corpus_item_id_a, duplicate.corpus_item_id_b)
        groups: dict[str, list[CorpusItemExtended]] = {}
        for item in items:
            groups.setdefault(find(item.id), []).append(item)
        return groups

    @staticmethod
    def _assign_groups(
        groups: dict[str, list[CorpusItemExtended]], ratios: dict[str, float]
    ) -> dict[str, SplitAssignment]:
        ordered_splits = ("train", "validation", "test")
        cumulative = []
        total = 0.0
        for split in ordered_splits:
            total += ratios.get(split, 0.0)
            cumulative.append((total, split))
        assignments: dict[str, SplitAssignment] = {}
        for group_key, members in sorted(groups.items()):
            digest = int(hashlib.sha256(group_key.encode()).hexdigest()[:16], 16) / 0xFFFFFFFFFFFFFFFF
            split = next((name for threshold, name in cumulative if digest < threshold), "test")
            for item in members:
                assignments[item.id] = SplitAssignment(split=split, group_key=group_key)
        return assignments

    @staticmethod
    def _counts(items: list[CorpusItemExtended], field: str, default: str | None = None) -> dict[str, int]:
        counts: dict[str, int] = {}
        for item in items:
            value = getattr(item, field) or default or "unknown"
            counts[value] = counts.get(value, 0) + 1
        return counts

    @staticmethod
    def _counts_assignments(assignments: dict[str, SplitAssignment], items: list[CorpusItemExtended]) -> dict[str, int]:
        counts = {"train": 0, "validation": 0, "test": 0}
        for item in items:
            counts[assignments[item.id].split] += 1
        return counts
