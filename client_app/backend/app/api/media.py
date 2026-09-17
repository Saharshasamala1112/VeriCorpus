from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.media_registry import get_capability, validate_file_signature
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.media import MediaAssetResponse, MediaUploadResponse
from app.services import media_service
from app.services.audit_service import log_audit

router = APIRouter(prefix="/media", tags=["Media"])

ALLOWED_TYPES = ("text", "document", "image", "audio", "video")


@router.post("/upload", response_model=MediaUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile,
    media_type: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    if media_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid media type. Allowed: {list(ALLOWED_TYPES)}")

    capability = get_capability(media_type)
    filename = file.filename or "unnamed"
    if not capability.accepts(filename, file.content_type):
        raise HTTPException(status_code=400, detail=f"Unsupported {media_type} format for {filename}")

    content = await file.read()
    max_size = min(settings.max_upload_size_bytes, capability.max_size_bytes)
    if len(content) > max_size:
        raise HTTPException(status_code=413, detail=f"File too large. Max: {max_size // (1024 * 1024)}MB")

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    is_valid, validation_error = validate_file_signature(media_type, content, filename)
    if not is_valid:
        raise HTTPException(status_code=400, detail=f"Invalid {media_type} content: {validation_error}")

    asset = await media_service.upload_media(
        db,
        current_user.id,
        media_type,
        filename,
        content,
        file.content_type or "application/octet-stream",
    )

    await log_audit(db, current_user.id, "upload", "media_asset", asset.id)

    return MediaUploadResponse(
        id=asset.id,
        filename=asset.original_filename,
        media_type=asset.media_type,
        file_size=asset.file_size,
        message="File uploaded successfully",
    )


@router.get("/", response_model=PaginatedResponse)
async def list_media(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    media_type: str | None = None,
    page: int = 1,
    page_size: int = 20,
):
    offset = (page - 1) * page_size
    items, total = await media_service.get_user_media_assets(db, current_user.id, media_type, page_size, offset)
    return PaginatedResponse(
        items=[MediaAssetResponse.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/{asset_id}", response_model=MediaAssetResponse)
async def get_media(
    asset_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    asset = await media_service.get_media_asset(db, asset_id)
    if not asset or asset.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Media asset not found")
    return asset


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    asset_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    deleted = await media_service.delete_media_asset(db, asset_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Media asset not found")
    await log_audit(db, current_user.id, "delete", "media_asset", asset_id)
