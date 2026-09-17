from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from .common import BaseSchema


class DatasetCreate(BaseModel):
    name: str
    description: str | None = None
    media_type: str


class DatasetResponse(BaseSchema):
    id: str
    name: str
    description: str | None
    media_type: str
    is_active: bool
    created_at: datetime


class DatasetVersionCreate(BaseModel):
    version: str
    description: str | None = None
    corpus_item_ids: list[str] = []


class DatasetVersionResponse(BaseSchema):
    id: str
    dataset_id: str
    version: str
    description: str | None
    sample_count: int
    checksum: str | None
    is_sealed: bool
    sealed_at: datetime | None
    created_at: datetime
