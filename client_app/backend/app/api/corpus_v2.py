from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, get_current_user, require_roles
from app.models.all_models import CorpusItem
from app.models.user import User, UserRole
from app.schemas.common import PaginatedResponse
from app.schemas.corpus import CorpusItemCreate, CorpusItemResponse

router = APIRouter(prefix="/corpus", tags=["Corpus"])


@router.post("/", response_model=CorpusItemResponse, status_code=status.HTTP_201_CREATED)
async def create_corpus_item(
    data: CorpusItemCreate,
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.ML_ENGINEER))],
    db: AsyncSession = Depends(get_db),
):
    item = CorpusItem(
        source=data.source,
        source_id=data.source_id,
        title=data.title,
        description=data.description,
        language=data.language,
        label=data.label,
        media_asset_id=data.media_asset_id,
        status="pending",
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.post("/refresh")
async def refresh_corpus_token(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    token = create_access_token(current_user.id)
    return {"access_token": token, "token_type": "bearer"}


@router.get("/", response_model=PaginatedResponse)
async def list_corpus_items(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = None,
    page: int = 1,
    page_size: int = 20,
):
    query = select(CorpusItem)
    count_query = select(func.count()).select_from(CorpusItem)
    if status_filter:
        query = query.where(CorpusItem.status == status_filter)
        count_query = count_query.where(CorpusItem.status == status_filter)
    total = (await db.execute(count_query)).scalar() or 0
    query = query.order_by(CorpusItem.created_at.desc()).limit(page_size).offset((page - 1) * page_size)
    result = await db.execute(query)
    items = list(result.scalars().all())
    return PaginatedResponse(
        items=[CorpusItemResponse.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.put("/{item_id}/review")
async def review_corpus_item(
    item_id: str,
    approve: bool,
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.REVIEWER))],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CorpusItem).where(CorpusItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Corpus item not found")
    from datetime import UTC, datetime

    item.status = "approved" if approve else "rejected"
    item.reviewed_by = current_user.id
    item.reviewed_at = datetime.now(UTC)
    await db.commit()
    return {"message": f"Item {'approved' if approve else 'rejected'}"}
