"""Corpus Intelligence API routes.

Full CRUD + review workflow + dashboard + dataset versioning + audit trail.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User, UserRole
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.corpus_intelligence import (
    AuditEventResponse,
    AuditTimelineEntry,
    BatchQuarantineRequest,
    BatchQuarantineResponse,
    BatchReviewRequest,
    BatchReviewResponse,
    CorpusItemCreate,
    CorpusItemResponse,
    CorpusItemUpdate,
    CorpusReviewRequest,
    DashboardResponse,
    DatasetVersionCreate,
    DatasetVersionResponse,
    DuplicateCheckResponse,
    DuplicateGroupListResponse,
    DuplicateGroupResponse,
    DuplicateRecordResponse,
    MarkTrainingUsedRequest,
    PipelineRunResponse,
    QualityAssessmentResponse,
    QualityCheckResponse,
    QuarantineRequest,
    VersionDiffResponse,
)
from app.services.corpus_dataset_builder import CorpusDatasetBuilder
from app.services.corpus_intelligence import CorpusIntelligenceService

router = APIRouter(prefix="/corpus-intel", tags=["Corpus Intelligence"])

# Single service instance (stateless, no mutable state)
_service = CorpusIntelligenceService()
_dataset_builder = CorpusDatasetBuilder(_service)


def _paginate(params: PaginationParams) -> dict:
    return {"limit": params.page_size, "offset": params.offset}


# ---------------------------------------------------------------------------
# INGESTION
# ---------------------------------------------------------------------------


@router.post("/items", response_model=CorpusItemResponse, status_code=status.HTTP_201_CREATED)
async def ingest_corpus_item(
    body: CorpusItemCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Ingest a media asset into the corpus.

    This is the entry point for new content into the corpus intelligence system.
    The item will be in PENDING status after ingestion.
    """
    try:
        item = await _service.ingest(
            media_asset_id=body.media_asset_id,
            source=body.source,
            source_id=body.source_id,
            language=body.language,
            title=body.title,
            label=body.label,
            label_confidence=body.label_confidence,
            consent_status=body.consent_status,
            license_type=body.license_type,
            created_by=current_user.id,
            db=db,
        )
        return CorpusItemResponse.model_validate(item)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ---------------------------------------------------------------------------
# LIST / GET
# ---------------------------------------------------------------------------


@router.get("/items", response_model=PaginatedResponse)
async def list_corpus_items(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    params: Annotated[PaginationParams, Depends()],
    media_type: str | None = Query(None),
    language: str | None = Query(None),
    corpus_status: str | None = Query(None, alias="status"),
    quality_status: str | None = Query(None),
    source: str | None = Query(None),
    search: str | None = Query(None),
):
    """List corpus items with filtering and pagination."""
    kwargs = _paginate(params)
    items, total = await _service.list_items(
        db=db,
        media_type=media_type,
        language=language,
        status=corpus_status,
        quality_status=quality_status,
        source=source,
        search=search,
        limit=kwargs["limit"],
        offset=kwargs["offset"],
    )
    return PaginatedResponse(
        items=[CorpusItemResponse.model_validate(i) for i in items],
        total=total,
        page=params.page,
        page_size=params.page_size,
        pages=(total + params.page_size - 1) // params.page_size,
    )


@router.get("/items/{item_id}", response_model=CorpusItemResponse)
async def get_corpus_item(
    item_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a single corpus item by ID."""
    item = await _service.get_item(item_id, db)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Corpus item not found")
    return CorpusItemResponse.model_validate(item)


@router.put("/items/{item_id}", response_model=CorpusItemResponse)
async def update_corpus_item(
    item_id: str,
    body: CorpusItemUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update metadata on a corpus item."""
    from sqlalchemy import select

    from app.models.corpus_intelligence import CorpusItemExtended

    result = await db.execute(select(CorpusItemExtended).where(CorpusItemExtended.id == item_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Corpus item not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)

    from app.models.corpus_intelligence import CorpusAuditAction

    await _service.audit.record_event(
        corpus_item_id=item.id,
        action=CorpusAuditAction.METADATA_UPDATED,
        performed_by=current_user.id,
        details=f"Updated fields: {', '.join(update_data.keys())}",
        db=db,
    )

    await db.commit()
    await db.refresh(item)
    return CorpusItemResponse.model_validate(item)


# ---------------------------------------------------------------------------
# PIPELINE
# ---------------------------------------------------------------------------


@router.post("/items/{item_id}/pipeline", response_model=PipelineRunResponse)
async def run_pipeline(
    item_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Run the full corpus pipeline (preprocessing → quality → duplicates) on an item."""
    try:
        summary = await _service.run_full_pipeline(item_id, db)
        return PipelineRunResponse(**summary)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/items/{item_id}/quality", response_model=CorpusItemResponse)
async def run_quality_checks(
    item_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Run quality assessment on a corpus item."""
    try:
        item = await _service.assess_quality(item_id, db)
        return CorpusItemResponse.model_validate(item)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/items/{item_id}/quality", response_model=QualityAssessmentResponse)
async def get_quality_results(
    item_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get quality check results for a corpus item."""
    from sqlalchemy import select

    from app.models.corpus_intelligence import CorpusItemExtended, CorpusQualityCheck

    item_result = await db.execute(select(CorpusItemExtended).where(CorpusItemExtended.id == item_id))
    item = item_result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Corpus item not found")

    checks_result = await db.execute(select(CorpusQualityCheck).where(CorpusQualityCheck.corpus_item_id == item_id))
    checks = list(checks_result.scalars().all())

    return QualityAssessmentResponse(
        overall_score=item.quality_score or 0.0,
        status=item.quality_status,
        passed=sum(1 for c in checks if c.result == "PASS"),
        failed=sum(1 for c in checks if c.result == "FAIL"),
        warned=sum(1 for c in checks if c.result == "WARN"),
        skipped=0,
        checks=[QualityCheckResponse.model_validate(c) for c in checks],
    )


@router.post("/items/{item_id}/duplicates", response_model=DuplicateCheckResponse)
async def check_duplicates(
    item_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Check for exact and near-duplicates of a corpus item."""
    try:
        result = await _service.detect_duplicates(item_id, db)
        return DuplicateCheckResponse(
            is_duplicate=result.is_duplicate,
            duplicate_type=result.duplicate_type.value if result.duplicate_type else None,
            similarity_score=result.similarity_score,
            duplicate_of_id=result.duplicate_of_id,
            details=result.details,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/items/{item_id}/duplicates", response_model=list[DuplicateRecordResponse])
async def list_item_duplicates(
    item_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all duplicate relationships involving a corpus item."""
    from app.services.duplicate_detection import DuplicateDetectionService

    dup_service = DuplicateDetectionService()
    duplicates = await dup_service.find_all_duplicates_of(item_id, db)
    return [DuplicateRecordResponse.model_validate(d) for d in duplicates]


# ---------------------------------------------------------------------------
# QUARANTINE
# ---------------------------------------------------------------------------


@router.post("/items/{item_id}/quarantine", response_model=CorpusItemResponse)
async def quarantine_item(
    item_id: str,
    body: QuarantineRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Quarantine a corpus item with a reason."""
    if current_user.role not in (UserRole.ADMIN, UserRole.ML_ENGINEER, UserRole.REVIEWER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    try:
        item = await _service.quarantine_item(item_id, body.reason, current_user.id, db)
        return CorpusItemResponse.model_validate(item)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/items/{item_id}/unquarantine", response_model=CorpusItemResponse)
async def release_from_quarantine(
    item_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Release a quarantined item back to PENDING for re-evaluation."""
    if current_user.role not in (UserRole.ADMIN, UserRole.ML_ENGINEER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin or ML Engineer role required")
    try:
        item = await _service.release_from_quarantine(item_id, current_user.id, db)
        return CorpusItemResponse.model_validate(item)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ---------------------------------------------------------------------------
# REVIEW WORKFLOW
# ---------------------------------------------------------------------------


@router.post("/items/{item_id}/review", response_model=CorpusItemResponse)
async def review_corpus_item(
    item_id: str,
    body: CorpusReviewRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Approve or reject a corpus item.

    Requires REVIEWER, ADMIN, or ML_ENGINEER role.
    """
    if current_user.role not in (UserRole.REVIEWER, UserRole.ADMIN, UserRole.ML_ENGINEER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reviewer role required")

    try:
        if body.action == "approve":
            item = await _service.approve_item(item_id, current_user.id, body.notes, db)
        else:
            item = await _service.reject_item(item_id, current_user.id, body.notes, db)
        return CorpusItemResponse.model_validate(item)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/items/batch/approve", response_model=BatchReviewResponse)
async def batch_approve_items(
    body: BatchReviewRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Batch approve multiple corpus items."""
    if current_user.role not in (UserRole.REVIEWER, UserRole.ADMIN, UserRole.ML_ENGINEER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reviewer role required")

    result = await _service.batch_approve(body.item_ids, current_user.id, body.notes, db)
    return BatchReviewResponse(**result)


@router.post("/items/batch/reject", response_model=BatchReviewResponse)
async def batch_reject_items(
    body: BatchReviewRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Batch reject multiple corpus items."""
    if current_user.role not in (UserRole.REVIEWER, UserRole.ADMIN, UserRole.ML_ENGINEER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reviewer role required")

    result = await _service.batch_reject(body.item_ids, current_user.id, body.notes, db)
    return BatchReviewResponse(**result)


@router.post("/items/batch/quarantine", response_model=BatchQuarantineResponse)
async def batch_quarantine_items(
    body: BatchQuarantineRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Batch quarantine multiple corpus items."""
    if current_user.role not in (UserRole.ADMIN, UserRole.ML_ENGINEER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin or ML Engineer role required")

    result = await _service.batch_quarantine(body.item_ids, body.reason, current_user.id, db)
    return BatchQuarantineResponse(**result)


@router.post("/items/mark-training-used", status_code=status.HTTP_204_NO_CONTENT)
async def mark_items_used_in_training(
    body: MarkTrainingUsedRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mark corpus items as used in a training run. Records audit events."""
    if current_user.role not in (UserRole.ADMIN, UserRole.ML_ENGINEER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin or ML Engineer role required")

    await _service.mark_used_in_training(body.item_ids, current_user.id, db)


# ---------------------------------------------------------------------------
# DUPLICATE GROUPS
# ---------------------------------------------------------------------------


@router.get("/duplicates/groups", response_model=DuplicateGroupListResponse)
async def list_duplicate_groups(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200),
):
    """List groups of duplicate items."""
    from app.services.duplicate_detection import DuplicateDetectionService

    dup_service = DuplicateDetectionService()
    groups = await dup_service.get_duplicate_groups(db, limit)
    return DuplicateGroupListResponse(
        groups=[DuplicateGroupResponse(**g) for g in groups],
        total=len(groups),
    )


# ---------------------------------------------------------------------------
# DATASET VERSIONING
# ---------------------------------------------------------------------------


@router.post(
    "/datasets/{dataset_id}/versions",
    response_model=DatasetVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_dataset_version(
    dataset_id: str,
    body: DatasetVersionCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new immutable dataset version.

    All corpus items must be in APPROVED status.
    """
    if current_user.role not in (UserRole.ADMIN, UserRole.ML_ENGINEER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin or ML Engineer role required")

    try:
        dv = await _service.versioning.create_version(
            dataset_id=dataset_id,
            corpus_item_ids=body.corpus_item_ids,
            description=body.description,
            created_by=current_user.id,
            db=db,
        )
        return DatasetVersionResponse.model_validate(dv)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/datasets/{dataset_id}/versions/next",
    response_model=DatasetVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def build_next_dataset_version(
    dataset_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    description: str | None = Query(None, max_length=2000),
):
    """Build the next version from validated, eligible corpus data.

    Duplicate and near-duplicate groups are assigned atomically to one split,
    preventing train/validation/test leakage.
    """
    if current_user.role not in (UserRole.ADMIN, UserRole.ML_ENGINEER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin or ML Engineer role required")
    try:
        version = await _dataset_builder.create_next_dataset_version(
            dataset_id,
            db,
            created_by=current_user.id,
            description=description,
        )
        return DatasetVersionResponse.model_validate(version)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get(
    "/datasets/{dataset_id}/versions",
    response_model=list[DatasetVersionResponse],
)
async def list_dataset_versions(
    dataset_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List versions for a dataset, newest first."""
    versions = await _service.versioning.list_versions(dataset_id, db, limit, offset)
    return [DatasetVersionResponse.model_validate(v) for v in versions]


@router.get(
    "/datasets/{dataset_id}/versions/{version_id}",
    response_model=DatasetVersionResponse,
)
async def get_dataset_version(
    dataset_id: str,
    version_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a specific dataset version."""
    dv = await _service.versioning.get_version(version_id, db)
    if dv is None or dv.dataset_id != dataset_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset version not found")
    return DatasetVersionResponse.model_validate(dv)


@router.get(
    "/datasets/{dataset_id}/versions/{version_id}/items",
    response_model=list[CorpusItemResponse],
)
async def get_version_items(
    dataset_id: str,
    version_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Get corpus items in a dataset version with pagination."""
    dv = await _service.versioning.get_version(version_id, db)
    if dv is None or dv.dataset_id != dataset_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset version not found")

    items = await _service.versioning.get_version_items(version_id, db, limit, offset)
    return [CorpusItemResponse.model_validate(i) for i in items]


@router.get(
    "/datasets/{dataset_id}/versions/{version_id_a}/diff/{version_id_b}",
    response_model=VersionDiffResponse,
)
async def diff_versions(
    dataset_id: str,
    version_id_a: str,
    version_id_b: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Compare two dataset versions and return differences."""
    v_a = await _service.versioning.get_version(version_id_a, db)
    v_b = await _service.versioning.get_version(version_id_b, db)
    if v_a is None or v_b is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset version not found")

    diff = await _service.versioning.diff_versions(version_id_a, version_id_b, db)
    return VersionDiffResponse(**diff)


# ---------------------------------------------------------------------------
# AUDIT TRAIL
# ---------------------------------------------------------------------------


@router.get("/items/{item_id}/audit", response_model=list[AuditEventResponse])
async def get_item_audit_events(
    item_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(100, ge=1, le=500),
):
    """Get audit events for a corpus item."""
    events = await _service.audit.get_item_events(item_id, db, limit)
    return [AuditEventResponse.model_validate(e) for e in events]


@router.get("/items/{item_id}/timeline", response_model=list[AuditTimelineEntry])
async def get_item_timeline(
    item_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a chronological timeline of events for a corpus item."""
    timeline = await _service.audit.get_event_timeline(item_id, db)
    return [AuditTimelineEntry(**entry) for entry in timeline]


@router.get("/audit", response_model=list[AuditEventResponse])
async def get_recent_audit_events(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200),
    action: str | None = Query(None),
):
    """Get recent audit events across all corpus items."""
    events = await _service.audit.get_recent_events(db, limit, action)
    return [AuditEventResponse.model_validate(e) for e in events]


# ---------------------------------------------------------------------------
# DASHBOARD
# ---------------------------------------------------------------------------


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get corpus dashboard statistics."""
    stats = await _service.get_dashboard(db)
    return DashboardResponse(**stats)
