from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.all_models import Model, ModelVersion
from app.models.user import User, UserRole
from app.schemas.common import PaginatedResponse
from app.schemas.model import ModelCreate, ModelResponse, ModelVersionResponse

router = APIRouter(prefix="/models", tags=["Models"])


@router.post("/", response_model=ModelResponse, status_code=status.HTTP_201_CREATED)
async def create_model(
    data: ModelCreate,
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ML_ENGINEER))],
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Model).where(Model.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Model name already exists")
    m = Model(name=data.name, description=data.description, media_type=data.media_type, architecture=data.architecture)
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return m


@router.get("/", response_model=PaginatedResponse)
async def list_models(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
):
    total = (await db.execute(select(func.count()).select_from(Model))).scalar() or 0
    result = await db.execute(
        select(Model).order_by(Model.created_at.desc()).limit(page_size).offset((page - 1) * page_size)
    )
    items = list(result.scalars().all())
    return PaginatedResponse(
        items=[ModelResponse.model_validate(m) for m in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/{model_id}", response_model=ModelResponse)
async def get_model(
    model_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Model).where(Model.id == model_id))
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")
    return m


@router.get("/{model_id}/versions", response_model=list[ModelVersionResponse])
async def list_model_versions(
    model_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ModelVersion).where(ModelVersion.model_id == model_id).order_by(ModelVersion.created_at.desc())
    )
    return list(result.scalars().all())
