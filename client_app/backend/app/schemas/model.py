from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from .common import BaseSchema


class ModelCreate(BaseModel):
    name: str
    description: str | None = None
    media_type: str
    architecture: str | None = None


class ModelResponse(BaseSchema):
    id: str
    name: str
    description: str | None
    media_type: str
    architecture: str | None
    is_active: bool
    created_at: datetime


class ModelVersionResponse(BaseSchema):
    id: str
    model_id: str
    version: str
    status: str
    accuracy: float | None
    f1_score: float | None
    precision_score: float | None
    recall_score: float | None
    trained_at: datetime | None
    created_at: datetime


class TrainingJobResponse(BaseSchema):
    id: str
    status: str
    model_name: str | None
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    created_at: datetime


class TrainingRunResponse(BaseSchema):
    id: str
    training_job_id: str | None
    status: str
    sample_count: int
    model_version: str | None
    metrics: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
