from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.analysis import (
    AnalysisPriority,
    AnalysisStatus,
    AnalyzerType,
    ModelProviderStatus,
    RiskLevel,
    SignalSeverity,
    SignalType,
)
from app.schemas.common import BaseSchema

# ---------------------------------------------------------------------------
# Video-specific response schemas
# ---------------------------------------------------------------------------


class AffectedRegionResponse(BaseSchema):
    id: str
    signal_id: str | None
    x: float
    y: float
    width: float
    height: float
    score: float | None
    explanation: str | None


class AffectedSegmentResponse(BaseSchema):
    id: str
    signal_id: str | None
    start_seconds: float
    end_seconds: float
    score: float | None
    explanation: str | None
    signal_type: str | None = None
    severity: str | None = None


class VideoFrameResponse(BaseSchema):
    frame_id: str
    frame_number: int
    timestamp: float
    thumbnail_url: str | None = None
    signal_type: str | None = None
    severity: str | None = None
    description: str | None = None
    regions: list[AffectedRegionResponse] = []


class VideoMetadataResponse(BaseSchema):
    duration_seconds: float | None = None
    width: int | None = None
    height: int | None = None
    fps: float | None = None
    codec: str | None = None
    audio_codec: str | None = None
    bit_rate: int | None = None
    sample_rate: int | None = None
    channels: int | None = None
    frame_count: int | None = None
    has_audio: bool = False
    resolution_class: str | None = None


class ModelInfoResponse(BaseSchema):
    model_id: str | None = None
    display_name: str | None = None
    version: str | None = None
    architecture: str | None = None
    modality: str | None = None
    framework: str | None = None
    dataset_version: str | None = None
    training_run_id: str | None = None
    status: str | None = None


class SignalBreakdownResponse(BaseSchema):
    signal_type: str
    label: str
    detected: bool
    strength: float | None = None
    description: str | None = None
    signal_count: int = 0


class VideoAnalysisFullResponse(BaseSchema):
    analysis_id: str
    asset_id: str | None = None
    assessment: str
    model_probability: float | None = None
    calibrated_probability: float | None = None
    evidence_strength: float | None = None
    risk_level: str | None = None
    summary: str | None = None
    duration: float | None = None
    metadata: VideoMetadataResponse | None = None
    segments: list[AffectedSegmentResponse] = []
    frames: list[VideoFrameResponse] = []
    signals: list[SignalResponse] = []
    signal_breakdown: list[SignalBreakdownResponse] = []
    evidence: list[dict[str, Any]] = []
    sources: list[dict[str, Any]] = []
    claims: list[dict[str, Any]] = []
    explanation: ExplanationResponseV2 | None = None
    limitations: list[str] = []
    model_info: ModelInfoResponse | None = None
    processing_status: str | None = None
    processing_metadata: dict[str, Any] | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Analysis request / response
# ---------------------------------------------------------------------------


class AnalysisRequestV2(BaseModel):
    media_asset_id: str | None = None
    text: str | None = None
    modality: str = "text"
    language: str = "en"
    analyzers: list[AnalyzerType] | None = None
    priority: AnalysisPriority = AnalysisPriority.NORMAL
    model_versions: dict[str, str] | None = None


class SignalResponse(BaseSchema):
    id: str
    signal_type: SignalType
    analyzer_type: AnalyzerType
    severity: SignalSeverity
    confidence: float
    title: str
    description: str | None
    evidence: dict[str, Any] | None
    model_id: str | None
    model_version: str | None
    created_at: datetime


class ExplanationResponseV2(BaseSchema):
    narrative: str
    key_factors: list[dict[str, Any]]
    recommendations: list[str]
    language: str


class AnalysisJobResponseV2(BaseSchema):
    id: str
    user_id: str
    modality: str
    status: AnalysisStatus
    priority: AnalysisPriority
    requested_analyzers: list[str] | None
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


class AnalysisResultResponseV2(BaseSchema):
    id: str
    job_id: str
    assessment: str
    confidence: float
    risk_level: RiskLevel
    ai_content_score: float | None
    model_probability: float | None = None
    calibrated_probability: float | None = None
    evidence_strength: float | None = None
    authenticity_score: float | None
    similarity_score: float | None
    plagiarism_score: float | None
    summary: str | None
    limitations: list[str] | None
    processing_metadata: dict[str, Any] | None
    created_at: datetime


class AnalysisFullResponseV2(BaseSchema):
    job: AnalysisJobResponseV2
    result: AnalysisResultResponseV2 | None
    signals: list[SignalResponse]
    explanation: ExplanationResponseV2 | None


# ---------------------------------------------------------------------------
# Model registry request / response
# ---------------------------------------------------------------------------


class ModelRegistryCreate(BaseModel):
    model_id: str
    display_name: str
    description: str | None = None
    modality: str
    task: str
    framework: str
    version: str
    status: ModelProviderStatus = ModelProviderStatus.DEVELOPMENT
    dataset_version: str | None = None
    storage_path: str | None = None
    accuracy: float | None = None
    f1_score: float | None = None
    precision_score: float | None = None
    recall_score: float | None = None
    metrics: dict[str, Any] | None = None


class ModelRegistryResponse(BaseSchema):
    id: str
    model_id: str
    display_name: str
    description: str | None
    modality: str
    task: str
    framework: str
    version: str
    status: ModelProviderStatus
    dataset_version: str | None
    accuracy: float | None
    f1_score: float | None
    precision_score: float | None
    recall_score: float | None
    promoted_at: datetime | None
    retired_at: datetime | None
    created_at: datetime


class ModelPromoteRequest(BaseModel):
    status: ModelProviderStatus
