from __future__ import annotations

import asyncio
import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.media_registry import get_capability, supported_modalities
from app.core.security import get_current_user
from app.models.processing import ProcessingStatus
from app.models.user import User
from app.schemas.processing import (
    IngestionUploadResponse,
    ProcessingJobCancelResponse,
    ProcessingJobDetailResponse,
    ProcessingJobListResponse,
    ProcessingJobResponse,
)
from app.services.audit_service import log_audit
from app.services.ingestion_pipeline import (
    IngestionPipeline,
    detect_modality,
)
from app.services.media_service import upload_media

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingestion", tags=["Ingestion"])

_background_tasks: set[asyncio.Task[None]] = set()


@router.post("/upload", response_model=IngestionUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_and_ingest(
    file: UploadFile,
    modality: str | None = None,
    current_user: Annotated[User, Depends(get_current_user)] = None,  # type: ignore[assignment]
    db: AsyncSession = Depends(get_db),
):
    """Upload a file and start the ingestion pipeline.

    The modality is auto-detected from MIME type and filename if not specified.
    Processing runs asynchronously — poll the job status endpoint for updates.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    mime_type = file.content_type or "application/octet-stream"

    # Auto-detect modality
    if modality is None:
        modality = detect_modality(mime_type, file.filename)
        if modality is None:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot determine modality for file '{file.filename}' (MIME: {mime_type}). "
                "Please specify modality explicitly.",
            )

    valid_modalities = set(supported_modalities())
    if modality not in valid_modalities:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid modality '{modality}'. Must be one of: {sorted(valid_modalities)}",
        )

    # Size check
    size_limit = get_capability(modality).max_size_bytes
    if len(content) > size_limit:
        max_mb = size_limit // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large for {modality} modality. Maximum: {max_mb}MB",
        )

    # Store the file
    asset = await upload_media(
        db,
        current_user.id,
        modality,
        file.filename,
        content,
        mime_type,
    )

    # Create processing job
    pipeline = IngestionPipeline(db)
    job = await pipeline.create_job(
        user_id=current_user.id,
        media_asset_id=asset.id,
        modality=modality,
    )

    # Launch background processing
    from app.core.config import settings as app_settings

    task = asyncio.create_task(
        _run_pipeline_background(
            job_id=job.id,
            file_path=asset.storage_path,
            file_size=len(content),
            mime_type=mime_type,
            original_filename=file.filename,
            db_url=app_settings.DATABASE_URL,
        )
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    await log_audit(db, current_user.id, "upload_and_ingest", "processing_job", job.id)

    return IngestionUploadResponse(
        job_id=job.id,
        media_asset_id=asset.id,
        modality=modality,
        status=job.status,
        message="File uploaded and processing started",
    )


async def _run_pipeline_background(
    job_id: str,
    file_path: str,
    file_size: int,
    mime_type: str,
    original_filename: str,
    db_url: str,
) -> None:
    """Wrapper for background pipeline execution."""
    from app.services.ingestion_pipeline import run_pipeline_async

    try:
        await run_pipeline_async(job_id, file_path, file_size, mime_type, original_filename, db_url)
    except Exception:
        logger.exception("Background pipeline failed for job %s", job_id)


@router.get("/jobs", response_model=ProcessingJobListResponse)
async def list_jobs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    job_status: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List processing jobs for the current user."""
    pipeline = IngestionPipeline(db)
    offset = (page - 1) * page_size
    items, total = await pipeline.list_user_jobs(
        current_user.id,
        status=job_status,
        limit=page_size,
        offset=offset,
    )
    return ProcessingJobListResponse(
        items=[ProcessingJobResponse.model_validate(j) for j in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/jobs/{job_id}", response_model=ProcessingJobDetailResponse)
async def get_job(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Get detailed status of a processing job."""
    pipeline = IngestionPipeline(db)
    job = await pipeline.get_job(job_id)
    if job is None or job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")

    response = ProcessingJobDetailResponse.model_validate(job)
    return response


@router.post("/jobs/{job_id}/cancel", response_model=ProcessingJobCancelResponse)
async def cancel_job(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Cancel a processing job."""
    pipeline = IngestionPipeline(db)
    job = await pipeline.get_job(job_id)
    if job is None or job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")

    cancelled = await pipeline.cancel_job(job_id)
    if not cancelled:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel job in status '{job.status}'",
        )

    return ProcessingJobCancelResponse(
        message="Job cancelled",
        job_id=job_id,
        status=ProcessingStatus.CANCELLED.value,
    )


@router.get("/jobs/{job_id}/events")
async def get_job_events(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Get all events for a processing job."""
    from sqlalchemy import select

    from app.models.processing import ProcessingJobEvent

    pipeline = IngestionPipeline(db)
    job = await pipeline.get_job(job_id)
    if job is None or job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")

    result = await db.execute(
        select(ProcessingJobEvent).where(ProcessingJobEvent.job_id == job_id).order_by(ProcessingJobEvent.created_at)
    )
    events = list(result.scalars().all())

    return [
        {
            "id": e.id,
            "step": e.step,
            "status": e.status,
            "message": e.message,
            "details_json": e.details_json,
            "duration_ms": e.duration_ms,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]


@router.get("/jobs/{job_id}/stream")
async def stream_job_events(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Server-Sent Events stream for real-time job updates."""
    pipeline = IngestionPipeline(db)
    job = await pipeline.get_job(job_id)
    if job is None or job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator():
        last_event_count = 0
        max_wait = 300  # 5 minutes max
        waited = 0

        while waited < max_wait:
            job = await pipeline.get_job(job_id)
            if job is None:
                break

            from sqlalchemy import func, select

            from app.models.processing import ProcessingJobEvent

            count_result = await db.execute(
                select(func.count()).select_from(ProcessingJobEvent).where(ProcessingJobEvent.job_id == job_id)
            )
            event_count = count_result.scalar() or 0

            if event_count > last_event_count:
                result = await db.execute(
                    select(ProcessingJobEvent)
                    .where(ProcessingJobEvent.job_id == job_id)
                    .order_by(ProcessingJobEvent.created_at.desc())
                    .limit(1)
                )
                latest_event = result.scalar_one_or_none()
                if latest_event:
                    data = json.dumps(
                        {
                            "job_id": job.id,
                            "status": job.status,
                            "progress": job.progress,
                            "current_step": job.current_step,
                            "event": {
                                "step": latest_event.step,
                                "status": latest_event.status,
                                "message": latest_event.message,
                            },
                        }
                    )
                    yield f"data: {data}\n\n"
                    last_event_count = event_count

            if job.status in (
                ProcessingStatus.COMPLETED.value,
                ProcessingStatus.FAILED.value,
                ProcessingStatus.CANCELLED.value,
            ):
                data = json.dumps(
                    {
                        "job_id": job.id,
                        "status": job.status,
                        "progress": job.progress,
                        "current_step": job.current_step,
                        "result_json": job.result_json,
                        "error": job.error_message,
                    }
                )
                yield f"data: {data}\n\n"
                break

            await asyncio.sleep(1)
            waited += 1

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/detect-modality")
async def detect_file_modality(
    file: UploadFile,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Detect the modality of a file from its MIME type and filename."""
    mime_type = file.content_type or "application/octet-stream"
    filename = file.filename or ""
    modality = detect_modality(mime_type, filename)
    return {
        "modality": modality,
        "mime_type": mime_type,
        "filename": filename,
    }
