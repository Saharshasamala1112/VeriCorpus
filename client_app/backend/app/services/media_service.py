from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.all_models import MediaAsset
from app.storage import LocalStorage, compute_sha256, generate_storage_path, sanitize_filename

storage = LocalStorage()


async def upload_media(
    db: AsyncSession,
    user_id: str,
    media_type: str,
    filename: str,
    content: bytes,
    mime_type: str,
) -> MediaAsset:
    clean_name = sanitize_filename(filename)
    path = generate_storage_path(media_type, clean_name, user_id)
    sha256 = compute_sha256(content)

    existing = await db.execute(select(MediaAsset).where(MediaAsset.sha256 == sha256, MediaAsset.owner_id == user_id))
    existing_asset = existing.scalar_one_or_none()
    if existing_asset:
        return existing_asset

    stored_path = await storage.upload(content, path, mime_type)

    asset = MediaAsset(
        owner_id=user_id,
        media_type=media_type,
        filename=path,
        original_filename=clean_name,
        mime_type=mime_type,
        file_size=len(content),
        storage_path=stored_path,
        sha256=sha256,
        status="uploaded",
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


async def get_media_asset(db: AsyncSession, asset_id: str) -> MediaAsset | None:
    result = await db.execute(select(MediaAsset).where(MediaAsset.id == asset_id))
    return result.scalar_one_or_none()


async def get_user_media_assets(
    db: AsyncSession,
    user_id: str,
    media_type: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[MediaAsset], int]:
    query = select(MediaAsset).where(MediaAsset.owner_id == user_id)
    count_query = select(func.count()).select_from(MediaAsset).where(MediaAsset.owner_id == user_id)

    if media_type:
        query = query.where(MediaAsset.media_type == media_type)
        count_query = count_query.where(MediaAsset.media_type == media_type)

    total = (await db.execute(count_query)).scalar() or 0
    query = query.order_by(MediaAsset.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def delete_media_asset(db: AsyncSession, asset_id: str, user_id: str) -> bool:
    asset = await get_media_asset(db, asset_id)
    if asset is None or asset.owner_id != user_id:
        return False
    await storage.delete(asset.filename)
    await db.delete(asset)
    await db.commit()
    return True
