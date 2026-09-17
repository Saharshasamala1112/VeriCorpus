from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models.all_models import TrainingJob, TrainingRun
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.model import TrainingJobResponse, TrainingRunResponse

router = APIRouter(prefix="/training", tags=["Training"])


@router.post("/jobs", response_model=TrainingJobResponse, status_code=status.HTTP_201_CREATED)
async def create_training_job(
    current_user: Annotated[User, Depends(require_permission("start_training"))],
    db: AsyncSession = Depends(get_db),
    model_name: str | None = None,
    dataset_version_id: str | None = None,
):
    job = TrainingJob(
        status="queued",
        triggered_by=current_user.id,
        model_name=model_name,
        dataset_version_id=dataset_version_id,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


@router.get("/jobs", response_model=PaginatedResponse)
async def list_training_jobs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
):
    total = (await db.execute(select(func.count()).select_from(TrainingJob))).scalar() or 0
    result = await db.execute(
        select(TrainingJob).order_by(TrainingJob.created_at.desc()).limit(page_size).offset((page - 1) * page_size)
    )
    items = list(result.scalars().all())
    return PaginatedResponse(
        items=[TrainingJobResponse.model_validate(j) for j in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/jobs/{job_id}", response_model=TrainingJobResponse)
async def get_training_job(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TrainingJob).where(TrainingJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")
    return job


@router.get("/runs", response_model=list[TrainingRunResponse])
async def list_training_runs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    job_id: str | None = None,
    limit: int = 50,
):
    query = select(TrainingRun)
    if job_id:
        query = query.where(TrainingRun.training_job_id == job_id)
    query = query.order_by(TrainingRun.created_at.desc()).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())
