from __future__ import annotations

from datetime import datetime

from .common import BaseSchema


class MediaAssetResponse(BaseSchema):
    id: str
    media_type: str
    filename: str
    original_filename: str
    mime_type: str
    file_size: int
    sha256: str
    status: str
    created_at: datetime


class MediaUploadResponse(BaseSchema):
    id: str
    filename: str
    media_type: str
    file_size: int
    message: str


class MediaMetadataResponse(BaseSchema):
    id: str
    media_asset_id: str
    width: int | None
    height: int | None
    duration_seconds: float | None
    sample_rate: int | None
    channels: int | None
    codec: str | None
    bit_rate: int | None
    text_length: int | None
    language_detected: str | None
