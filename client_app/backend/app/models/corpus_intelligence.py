"""Corpus Intelligence Layer - Extended models for corpus management.

This module defines the extended data models for the corpus intelligence system,
including quality assessment, duplicate detection, dataset versioning with full
provenance tracking, and audit event logging.
"""

from __future__ import annotations

import enum
from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, Text, UniqueConstraint, event, inspect
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, generate_uuid


class CorpusItemStatus(enum.StrEnum):
    """Corpus item lifecycle statuses."""

    PENDING = "PENDING"
    INGESTING = "INGESTING"
    PREPROCESSING = "PREPROCESSING"
    QUALITY_CHECK = "QUALITY_CHECK"
    VALIDATED = "VALIDATED"
    QUARANTINED = "QUARANTINED"
    REJECTED = "REJECTED"
    APPROVED = "APPROVED"
    IN_DATASET = "IN_DATASET"


class QualityCheckType(enum.StrEnum):
    """Types of quality checks that can be performed."""

    CORRUPT_FILE = "CORRUPT_FILE"
    UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT"
    EMPTY_CONTENT = "EMPTY_CONTENT"
    DUPLICATE_CONTENT = "DUPLICATE_CONTENT"
    NEAR_DUPLICATE = "NEAR_DUPLICATE"
    LOW_QUALITY_MEDIA = "LOW_QUALITY_MEDIA"
    INVALID_METADATA = "INVALID_METADATA"
    LANGUAGE_MISMATCH = "LANGUAGE_MISMATCH"
    ANNOTATION_INCONSISTENCY = "ANNOTATION_INCONSISTENCY"
    SUSPICIOUS_INPUT = "SUSPICIOUS_INPUT"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    FILE_TOO_SMALL = "FILE_TOO_SMALL"


class QualityCheckResult(enum.StrEnum):
    """Result of an individual quality check."""

    PASS = "PASS"
    FAIL = "FAIL"
    WARN = "WARN"
    SKIP = "SKIP"


class CorpusAuditAction(enum.StrEnum):
    """Audit actions for corpus lifecycle events."""

    UPLOADED = "UPLOADED"
    INGESTED = "INGESTED"
    PREPROCESSED = "PREPROCESSED"
    QUALITY_CHECKED = "QUALITY_CHECKED"
    VALIDATED = "VALIDATED"
    QUARANTINED = "QUARANTINED"
    REJECTED = "REJECTED"
    APPROVED = "APPROVED"
    ADDED_TO_DATASET = "ADDED_TO_DATASET"
    REMOVED_FROM_DATASET = "REMOVED_FROM_DATASET"
    USED_IN_TRAINING = "USED_IN_TRAINING"
    STATUS_CHANGED = "STATUS_CHANGED"
    METADATA_UPDATED = "METADATA_UPDATED"
    DUPLICATE_DETECTED = "DUPLICATE_DETECTED"
    REVIEWED = "REVIEWED"


class DuplicateType(enum.StrEnum):
    """Type of duplicate detection."""

    EXACT = "EXACT"
    NEAR = "NEAR"


# ---------------------------------------------------------------------------
# Extended Corpus Item
# ---------------------------------------------------------------------------


class CorpusItemExtended(TimestampMixin, Base):
    """Extended corpus item with full metadata for the intelligence layer.

    This replaces the basic CorpusItem with comprehensive fields for:
    - Provenance and consent tracking
    - Quality assessment results
    - Preprocessing version tracking
    - Annotation metadata
    - Training eligibility
    """

    __tablename__ = "corpus_items_ext"
    __table_args__ = (
        Index("idx_cie_status", "status"),
        Index("idx_cie_media_type", "media_type"),
        Index("idx_cie_language", "language"),
        Index("idx_cie_quality_status", "quality_status"),
        Index("idx_cie_content_hash", "content_hash"),
        Index("idx_cie_source", "source"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    media_asset_id: Mapped[str | None] = mapped_column(ForeignKey("media_assets.id"), unique=True, nullable=True)

    # Core identity
    media_type: Mapped[str] = mapped_column(String(20), nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    source_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    original_filename: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Content fingerprinting
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(nullable=True)

    # Language and content
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Annotation metadata
    label: Mapped[str | None] = mapped_column(String(50), nullable=True)
    label_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    annotation_status: Mapped[str] = mapped_column(String(20), default="unannotated", nullable=False)

    # Quality assessment
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    quality_status: Mapped[str] = mapped_column(String(20), default="unchecked", nullable=False)

    # Lifecycle status
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False)

    # Provenance
    ingestion_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    preprocessing_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ingestion_pipeline_version: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Consent and licensing
    consent_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    license_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rights_holder: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Verification
    verification_status: Mapped[str] = mapped_column(String(20), default="unverified", nullable=False)
    verified_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Review workflow
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Training eligibility
    training_eligible: Mapped[bool] = mapped_column(default=False, nullable=False)
    training_eligibility_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Creator
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    # Relationships
    media_asset: Mapped[MediaAsset | None] = relationship(foreign_keys=[media_asset_id])
    quality_checks: Mapped[list[CorpusQualityCheck]] = relationship(back_populates="corpus_item", lazy="selectin")
    audit_events: Mapped[list[CorpusAuditEvent]] = relationship(back_populates="corpus_item", lazy="selectin")
    dataset_version_links: Mapped[list[DatasetVersionItemExt]] = relationship(back_populates="corpus_item")


# ---------------------------------------------------------------------------
# Quality Pipeline
# ---------------------------------------------------------------------------


class CorpusQualityCheck(TimestampMixin, Base):
    """Individual quality check result for a corpus item.

    Each check records:
    - What type of check was run
    - The result (pass/fail/warn)
    - A score where applicable
    - Details about any issues found
    - Which pipeline version ran the check
    """

    __tablename__ = "corpus_quality_checks"
    __table_args__ = (
        Index("idx_cqc_item", "corpus_item_id"),
        Index("idx_cqc_check_type", "check_type"),
        UniqueConstraint("corpus_item_id", "check_type", name="uq_item_check_type"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    corpus_item_id: Mapped[str] = mapped_column(ForeignKey("corpus_items_ext.id"), nullable=False)
    check_type: Mapped[str] = mapped_column(String(50), nullable=False)
    result: Mapped[str] = mapped_column(String(20), nullable=False)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    pipeline_version: Mapped[str | None] = mapped_column(String(50), nullable=True)

    corpus_item: Mapped[CorpusItemExtended] = relationship(back_populates="quality_checks")


# ---------------------------------------------------------------------------
# Duplicate Detection
# ---------------------------------------------------------------------------


class CorpusDuplicate(TimestampMixin, Base):
    """Tracks duplicate relationships between corpus items.

    - EXACT: content_hash match (cryptographic duplicate)
    - NEAR: embedding/feature similarity above threshold
      (requires a separate embedding store; this table records the link)
    """

    __tablename__ = "corpus_duplicates"
    __table_args__ = (
        Index("idx_cd_item_a", "corpus_item_id_a"),
        Index("idx_cd_item_b", "corpus_item_id_b"),
        UniqueConstraint("corpus_item_id_a", "corpus_item_id_b", "duplicate_type", name="uq_duplicate_pair"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    corpus_item_id_a: Mapped[str] = mapped_column(ForeignKey("corpus_items_ext.id"), nullable=False)
    corpus_item_id_b: Mapped[str] = mapped_column(ForeignKey("corpus_items_ext.id"), nullable=False)
    duplicate_type: Mapped[str] = mapped_column(String(20), nullable=False)
    similarity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    detected_by: Mapped[str | None] = mapped_column(String(50), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)


# ---------------------------------------------------------------------------
# Dataset Versioning (Extended)
# ---------------------------------------------------------------------------


class DatasetVersionExtended(TimestampMixin, Base):
    """Immutable dataset version with full metadata.

    Each version is a snapshot that never mutates.
    Records:
    - Which corpus items are included
    - Preprocessing and annotation versions used
    - Creator and creation timestamp
    - Aggregate statistics
    - Validation results
    - Checksum for integrity verification
    """

    __tablename__ = "dataset_versions_ext"
    __table_args__ = (
        Index("idx_dve_dataset", "dataset_id"),
        UniqueConstraint("dataset_id", "version", name="uq_dataset_version"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Provenance
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    preprocessing_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    annotation_version: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Content fingerprint
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Aggregate statistics (JSON blob for flexibility)
    statistics: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Schema: {"total_items": int, "by_media_type": {...}, "by_language": {...},
    #          "by_quality_status": {...}, "avg_quality_score": float,
    #          "annotation_coverage": float, "training_eligible_count": int}

    # Validation results (JSON blob)
    validation_results: Mapped[str | None] = mapped_column(Text, nullable=True)
    corpus_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    inclusion_rules: Mapped[str | None] = mapped_column(Text, nullable=True)
    exclusion_rules: Mapped[str | None] = mapped_column(Text, nullable=True)
    label_schema: Mapped[str | None] = mapped_column(Text, nullable=True)
    language_distribution: Mapped[str | None] = mapped_column(Text, nullable=True)
    modality_distribution: Mapped[str | None] = mapped_column(Text, nullable=True)
    class_distribution: Mapped[str | None] = mapped_column(Text, nullable=True)
    duplicate_policy: Mapped[str | None] = mapped_column(Text, nullable=True)
    split_counts: Mapped[str | None] = mapped_column(Text, nullable=True)
    fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # Schema: {"passed": bool, "checks_run": int, "checks_passed": int,
    #          "checks_failed": int, "issues": [...]}

    # Integrity
    is_sealed: Mapped[bool] = mapped_column(default=False, nullable=False)
    sealed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    corpus_item_links: Mapped[list[DatasetVersionItemExt]] = relationship(
        back_populates="dataset_version", lazy="selectin"
    )
    splits: Mapped[list[DatasetSplitExtended]] = relationship(cascade="all, delete-orphan", lazy="selectin")


@event.listens_for(DatasetVersionExtended, "before_update")
def reject_sealed_dataset_update(mapper, connection, target) -> None:
    if not target.is_sealed:
        return
    state = inspect(target)
    sealed_history = state.attrs.is_sealed.history
    if sealed_history.has_changes() and not any(sealed_history.deleted):
        return
    if any(attribute.history.has_changes() for attribute in state.attrs if attribute.key not in {"updated_at"}):
        raise ValueError("Sealed dataset versions are immutable; create a new version instead")


@event.listens_for(DatasetVersionExtended, "before_delete")
def reject_dataset_version_delete(mapper, connection, target) -> None:
    raise ValueError("Dataset versions are immutable and cannot be deleted")


class DatasetVersionItemExt(Base):
    """Associates corpus items with dataset versions (immutable link table)."""

    __tablename__ = "dataset_version_items_ext"

    dataset_version_id: Mapped[str] = mapped_column(ForeignKey("dataset_versions_ext.id"), primary_key=True)
    corpus_item_id: Mapped[str] = mapped_column(ForeignKey("corpus_items_ext.id"), primary_key=True)
    split: Mapped[str] = mapped_column(String(20), nullable=False, default="train")
    group_key: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    dataset_version: Mapped[DatasetVersionExtended] = relationship(back_populates="corpus_item_links")
    corpus_item: Mapped[CorpusItemExtended] = relationship(back_populates="dataset_version_links")


class DatasetSplitExtended(TimestampMixin, Base):
    """Materialized split counts and strategy for an immutable dataset version."""

    __tablename__ = "dataset_splits_ext"
    __table_args__ = (UniqueConstraint("dataset_version_id", "name", name="uq_dataset_split_ext"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    dataset_version_id: Mapped[str] = mapped_column(ForeignKey("dataset_versions_ext.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(20), nullable=False)
    sample_count: Mapped[int] = mapped_column(default=0, nullable=False)
    strategy: Mapped[str] = mapped_column(String(100), nullable=False)


# ---------------------------------------------------------------------------
# Corpus Audit Events
# ---------------------------------------------------------------------------


class CorpusAuditEvent(TimestampMixin, Base):
    """Dedicated audit event for corpus lifecycle transitions.

    Every important corpus state change generates one of these events,
    providing a complete audit trail.
    """

    __tablename__ = "corpus_audit_events"
    __table_args__ = (
        Index("idx_cae_item", "corpus_item_id"),
        Index("idx_cae_action", "action"),
        Index("idx_cae_created", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    corpus_item_id: Mapped[str] = mapped_column(ForeignKey("corpus_items_ext.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    previous_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    new_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    performed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    corpus_item: Mapped[CorpusItemExtended] = relationship(back_populates="audit_events")


# ---------------------------------------------------------------------------
# Preprocessing Pipeline
# ---------------------------------------------------------------------------


class PreprocessingPipeline(TimestampMixin, Base):
    """Records preprocessing pipeline executions for traceability."""

    __tablename__ = "preprocessing_pipelines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    version: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    steps: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)


# Need to import MediaAsset from all_models for relationship resolution
from .all_models import MediaAsset  # noqa: E402
