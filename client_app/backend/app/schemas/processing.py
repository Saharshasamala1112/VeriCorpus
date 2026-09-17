from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ProcessingJobCreate(BaseSchema):
    media_asset_id: str
    modality: str = Field(..., description="Media modality: text, image, audio, video, document")


class ProcessingJobResponse(BaseSchema):
    id: str
    user_id: str
    media_asset_id: str
    modality: str
    status: str
    progress: int
    current_step: str | None = None
    error_message: str | None = None
    error_code: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    attempt_count: int = 0
    max_retries: int = 3
    next_retry_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ProcessingJobDetailResponse(ProcessingJobResponse):
    result_json: str | None = None
    events: list[ProcessingEventResponse] = []


class ProcessingEventResponse(BaseSchema):
    id: str
    step: str
    status: str
    message: str | None = None
    details_json: str | None = None
    duration_ms: int | None = None
    created_at: datetime


class ProcessingJobListResponse(BaseSchema):
    items: list[ProcessingJobResponse]
    total: int
    page: int
    page_size: int
    pages: int


class ProcessingJobCancelResponse(BaseSchema):
    message: str
    job_id: str
    status: str


class ModalityResult(BaseSchema):
    modality: str
    metadata: dict[str, Any] = {}
    features: dict[str, Any] = {}
    warnings: list[str] = []
    errors: list[str] = []


class IngestionUploadResponse(BaseSchema):
    job_id: str
    media_asset_id: str
    modality: str
    status: str
    message: str


class ProcessingStatusUpdate(BaseSchema):
    job_id: str
    status: str
    progress: int
    current_step: str | None = None
    result: dict[str, Any] | None = None
    error: str | None = None
