from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models.all_models import Dataset, DatasetVersion
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.dataset import DatasetCreate, DatasetResponse, DatasetVersionCreate, DatasetVersionResponse

router = APIRouter(prefix="/datasets", tags=["Datasets"])


@router.post("/", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def create_dataset(
    data: DatasetCreate,
    current_user: Annotated[User, Depends(require_permission("modify_datasets"))],
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Dataset).where(Dataset.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Dataset name already exists")
    ds = Dataset(name=data.name, description=data.description, media_type=data.media_type, created_by=current_user.id)
    db.add(ds)
    await db.commit()
    await db.refresh(ds)
    return ds


@router.get("/", response_model=PaginatedResponse)
async def list_datasets(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
):
    total = (await db.execute(select(func.count()).select_from(Dataset))).scalar() or 0
    result = await db.execute(
        select(Dataset).order_by(Dataset.created_at.desc()).limit(page_size).offset((page - 1) * page_size)
    )
    items = list(result.scalars().all())
    return PaginatedResponse(
        items=[DatasetResponse.model_validate(d) for d in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    ds = result.scalar_one_or_none()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return ds


@router.post("/{dataset_id}/versions", response_model=DatasetVersionResponse, status_code=status.HTTP_201_CREATED)
async def create_dataset_version(
    dataset_id: str,
    data: DatasetVersionCreate,
    current_user: Annotated[User, Depends(require_permission("modify_datasets"))],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    ds = result.scalar_one_or_none()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    dv = DatasetVersion(
        dataset_id=dataset_id,
        version=data.version,
        description=data.description,
        created_by=current_user.id,
    )
    db.add(dv)
    await db.flush()

    if data.corpus_item_ids:
        from sqlalchemy import insert

        from app.models.all_models import DatasetVersionItem

        for cid in data.corpus_item_ids:
            await db.execute(insert(DatasetVersionItem).values(dataset_version_id=dv.id, corpus_item_id=cid))
        dv.sample_count = len(data.corpus_item_ids)

    dv.is_sealed = True
    dv.sealed_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(dv)
    return dv


@router.get("/{dataset_id}/versions", response_model=list[DatasetVersionResponse])
async def list_dataset_versions(
    dataset_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DatasetVersion).where(DatasetVersion.dataset_id == dataset_id).order_by(DatasetVersion.created_at.desc())
    )
    return list(result.scalars().all())
