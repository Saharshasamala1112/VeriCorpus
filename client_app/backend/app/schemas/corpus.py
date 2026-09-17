from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from .common import BaseSchema


class CorpusItemCreate(BaseModel):
    source: str
    source_id: str | None = None
    title: str
    description: str | None = None
    language: str = "en"
    label: str | None = None
    media_asset_id: str | None = None


class CorpusItemResponse(BaseSchema):
    id: str
    source: str
    source_id: str | None
    title: str
    description: str | None
    language: str
    label: str | None
    label_confidence: float | None
    status: str
    created_at: datetime


class CorpusSyncRequest(BaseModel):
    source: str = "swecha"
    batch_size: int = 50
    max_records: int = 500
