from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.all_models import AnalysisJob, AnalysisResult, Explanation, ProcessingEvent
from app.models.user import User
from app.schemas.analysis import (
    AnalysisFullResponse,
    AnalysisJobResponse,
    AnalysisRequest,
    AnalysisResultResponse,
    ExplanationResponse,
)
from app.schemas.common import PaginatedResponse
from app.services.audit_service import log_audit

router = APIRouter(prefix="/analysis", tags=["Analysis"])


@router.post("/", response_model=AnalysisJobResponse, status_code=status.HTTP_201_CREATED)
async def create_analysis(
    data: AnalysisRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    if not data.text and not data.media_asset_id:
        raise HTTPException(status_code=400, detail="Provide text or media_asset_id")

    job = AnalysisJob(
        user_id=current_user.id,
        media_asset_id=data.media_asset_id,
        input_type=data.input_type,
        input_text=data.text,
        status="pending",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    await log_audit(db, current_user.id, "create_analysis", "analysis_job", job.id)

    event = ProcessingEvent(analysis_job_id=job.id, step="input", status="complete", message="Job created")
    db.add(event)
    await db.commit()

    return job


@router.get("/", response_model=PaginatedResponse)
async def list_analyses(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
):
    query = select(AnalysisJob).where(AnalysisJob.user_id == current_user.id)
    count_query = select(func.count()).select_from(AnalysisJob).where(AnalysisJob.user_id == current_user.id)
    total = (await db.execute(count_query)).scalar() or 0
    query = query.order_by(AnalysisJob.created_at.desc()).limit(page_size).offset((page - 1) * page_size)
    result = await db.execute(query)
    items = list(result.scalars().all())
    return PaginatedResponse(
        items=[AnalysisJobResponse.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/{job_id}", response_model=AnalysisFullResponse)
async def get_analysis(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AnalysisJob).where(AnalysisJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job or job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Analysis not found")

    result_r = await db.execute(select(AnalysisResult).where(AnalysisResult.analysis_job_id == job_id))
    analysis_result = result_r.scalar_one_or_none()

    explanation = None
    if analysis_result:
        result_e = await db.execute(select(Explanation).where(Explanation.analysis_result_id == analysis_result.id))
        explanation = result_e.scalar_one_or_none()

    return AnalysisFullResponse(
        job=AnalysisJobResponse.model_validate(job),
        result=AnalysisResultResponse.model_validate(analysis_result) if analysis_result else None,
        explanation=ExplanationResponse.model_validate(explanation) if explanation else None,
    )


@router.get("/{job_id}/events", response_model=list)
async def get_analysis_events(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AnalysisJob).where(AnalysisJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job or job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Analysis not found")

    events = await db.execute(
        select(ProcessingEvent).where(ProcessingEvent.analysis_job_id == job_id).order_by(ProcessingEvent.created_at)
    )
    return [
        {"step": e.step, "status": e.status, "message": e.message, "duration_ms": e.duration_ms}
        for e in events.scalars().all()
    ]
