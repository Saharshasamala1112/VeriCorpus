"""Schemas for the Corpus Intelligence API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from .common import BaseSchema

# ---------------------------------------------------------------------------
# Corpus Item Schemas
# ---------------------------------------------------------------------------


class CorpusItemCreate(BaseModel):
    """Request to ingest a media asset into the corpus."""

    media_asset_id: str
    source: str = Field(..., min_length=1, max_length=100)
    source_id: str | None = Field(None, max_length=200)
    language: str = Field("en", max_length=10)
    title: str | None = Field(None, max_length=500)
    label: str | None = Field(None, max_length=50)
    label_confidence: float | None = Field(None, ge=0.0, le=1.0)
    consent_status: str | None = Field(None, max_length=50)
    license_type: str | None = Field(None, max_length=100)


class CorpusItemResponse(BaseSchema):
    """Response for a corpus item."""

    id: str
    media_asset_id: str | None
    media_type: str
    source: str
    source_id: str | None
    original_filename: str | None
    content_hash: str
    mime_type: str | None
    file_size_bytes: int | None
    language: str
    title: str
    description: str | None
    label: str | None
    label_confidence: float | None
    annotation_status: str
    quality_score: float | None
    quality_status: str
    status: str
    ingestion_timestamp: datetime | None
    preprocessing_version: str | None
    consent_status: str | None
    license_type: str | None
    verification_status: str
    training_eligible: bool
    training_eligibility_reason: str | None
    created_by: str | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    review_notes: str | None
    created_at: datetime
    updated_at: datetime


class CorpusItemUpdate(BaseModel):
    """Update metadata on a corpus item."""

    title: str | None = Field(None, max_length=500)
    description: str | None = None
    language: str | None = Field(None, max_length=10)
    label: str | None = Field(None, max_length=50)
    label_confidence: float | None = Field(None, ge=0.0, le=1.0)
    consent_status: str | None = Field(None, max_length=50)
    license_type: str | None = Field(None, max_length=100)
    rights_holder: str | None = Field(None, max_length=200)
    training_eligible: bool | None = None
    training_eligibility_reason: str | None = None


class CorpusReviewRequest(BaseModel):
    """Review action on a corpus item."""

    action: str = Field(..., pattern="^(approve|reject)$")
    notes: str | None = Field(None, max_length=1000)


# ---------------------------------------------------------------------------
# Quality Schemas
# ---------------------------------------------------------------------------


class QualityCheckResponse(BaseSchema):
    """Individual quality check result."""

    id: str
    check_type: str
    result: str
    score: float | None
    details: str | None
    pipeline_version: str | None
    created_at: datetime


class QualityAssessmentResponse(BaseModel):
    """Quality assessment summary."""

    overall_score: float
    status: str
    passed: int
    failed: int
    warned: int
    skipped: int
    checks: list[QualityCheckResponse]


# ---------------------------------------------------------------------------
# Duplicate Schemas
# ---------------------------------------------------------------------------


class DuplicateCheckResponse(BaseModel):
    """Result of a duplicate check."""

    is_duplicate: bool
    duplicate_type: str | None
    similarity_score: float | None
    duplicate_of_id: str | None
    details: str | None


class DuplicateGroupResponse(BaseModel):
    """A group of duplicate items."""

    item_ids: list[str]
    count: int
    type: str


# ---------------------------------------------------------------------------
# Dataset Version Schemas
# ---------------------------------------------------------------------------


class DatasetVersionCreate(BaseModel):
    """Create a new immutable dataset version."""

    corpus_item_ids: list[str] = Field(..., min_length=1)
    description: str | None = Field(None, max_length=2000)


class DatasetVersionResponse(BaseSchema):
    """Dataset version response."""

    id: str
    dataset_id: str
    version: str
    description: str | None
    created_by: str | None
    preprocessing_version: str | None
    annotation_version: str | None
    checksum: str | None
    statistics: str | None
    validation_results: str | None
    is_sealed: bool
    sealed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    corpus_snapshot: str | None = None
    inclusion_rules: str | None = None
    exclusion_rules: str | None = None
    label_schema: str | None = None
    language_distribution: str | None = None
    modality_distribution: str | None = None
    class_distribution: str | None = None
    duplicate_policy: str | None = None
    split_counts: str | None = None
    fingerprint: str | None = None


class VersionDiffResponse(BaseModel):
    """Result of comparing two dataset versions."""

    version_a: dict
    version_b: dict
    added_count: int
    removed_count: int
    common_count: int
    added_item_ids: list[str]
    removed_item_ids: list[str]


# ---------------------------------------------------------------------------
# Audit Schemas
# ---------------------------------------------------------------------------


class AuditEventResponse(BaseSchema):
    """Corpus audit event."""

    id: str
    corpus_item_id: str
    action: str
    previous_status: str | None
    new_status: str | None
    performed_by: str | None
    details: str | None
    ip_address: str | None
    created_at: datetime


class AuditTimelineEntry(BaseModel):
    """Timeline entry for an audit event."""

    timestamp: str | None
    action: str
    previous_status: str | None
    new_status: str | None
    performed_by: str | None
    details: str | None


# ---------------------------------------------------------------------------
# Dashboard Schemas
# ---------------------------------------------------------------------------


class DashboardResponse(BaseModel):
    """Corpus dashboard statistics."""

    total_items: int
    by_media_type: dict[str, int]
    by_language: dict[str, int]
    by_quality_status: dict[str, int]
    by_status: dict[str, int]
    pending_review: int
    training_eligible: int
    dataset_versions: int
    recent_ingestions_24h: int
    avg_quality_score: float | None
    quarantined: int = 0


# ---------------------------------------------------------------------------
# Batch Operation Schemas
# ---------------------------------------------------------------------------


class BatchReviewRequest(BaseModel):
    """Batch review request for multiple corpus items."""

    item_ids: list[str] = Field(..., min_length=1, max_length=100)
    notes: str | None = Field(None, max_length=1000)


class BatchReviewResponse(BaseModel):
    """Result of a batch review operation."""

    approved: list[str] = Field(default_factory=list)
    rejected: list[str] = Field(default_factory=list)
    failed: list[dict[str, str]] = Field(default_factory=list)


class BatchQuarantineRequest(BaseModel):
    """Batch quarantine request."""

    item_ids: list[str] = Field(..., min_length=1, max_length=100)
    reason: str = Field(..., min_length=1, max_length=1000)


class BatchQuarantineResponse(BaseModel):
    """Result of a batch quarantine operation."""

    quarantined: list[str] = Field(default_factory=list)
    failed: list[dict[str, str]] = Field(default_factory=list)


class QuarantineRequest(BaseModel):
    """Quarantine request for a single item."""

    reason: str = Field(..., min_length=1, max_length=1000)


# ---------------------------------------------------------------------------
# Duplicate Schemas (extended)
# ---------------------------------------------------------------------------


class DuplicateGroupListResponse(BaseModel):
    """List of duplicate groups."""

    groups: list[DuplicateGroupResponse]
    total: int


class DuplicateListResponse(BaseModel):
    """List of duplicate relationships."""

    duplicates: list[DuplicateRecordResponse]
    total: int


class DuplicateRecordResponse(BaseModel):
    """A single duplicate relationship record."""

    id: str
    corpus_item_id_a: str
    corpus_item_id_b: str
    duplicate_type: str
    similarity_score: float | None
    detected_by: str | None
    details: str | None
    created_at: datetime


class MarkTrainingUsedRequest(BaseModel):
    """Request to mark items as used in training."""

    item_ids: list[str] = Field(..., min_length=1, max_length=500)


# ---------------------------------------------------------------------------
# Pipeline Schemas
# ---------------------------------------------------------------------------


class PipelineRunResponse(BaseModel):
    """Result of running the full pipeline on a corpus item."""

    item_id: str
    stages: dict
    final_status: str
