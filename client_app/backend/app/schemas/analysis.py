from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from .common import BaseSchema


class AnalysisRequest(BaseModel):
    text: str | None = None
    media_asset_id: str | None = None
    input_type: str = "text"
    language: str = "en"


class AnalysisJobResponse(BaseSchema):
    id: str
    user_id: str
    input_type: str
    status: str
    pipeline_step: str | None
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


class AnalysisResultResponse(BaseSchema):
    id: str
    analysis_job_id: str
    ai_score: float
    human_score: float
    confidence: float
    risk_level: str
    summary: str | None
    signals: str | None
    model_used: str | None
    model_version: str | None
    dataset_version: str | None
    created_at: datetime


class ExplanationResponse(BaseSchema):
    id: str
    analysis_result_id: str
    language: str
    narrative: str
    key_factors: str | None
    recommendations: str | None


class AnalysisFullResponse(BaseSchema):
    job: AnalysisJobResponse
    result: AnalysisResultResponse | None
    explanation: ExplanationResponse | None
