from __future__ import annotations

import enum
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, generate_uuid

if TYPE_CHECKING:
    from app.models.all_models import DatasetVersion, ModelVersion

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class AnalysisStatus(enum.StrEnum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AnalysisPriority(enum.StrEnum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class RiskLevel(enum.StrEnum):
    MINIMAL = "minimal"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SignalType(enum.StrEnum):
    AI_CONTENT = "ai_content"
    SIMILARITY = "similarity"
    PLAGIARISM = "plagiarism"
    AUTHENTICITY = "authenticity"
    METADATA_ANOMALY = "metadata_anomaly"
    LANGUAGE = "language"
    COMPRESSION = "compression"
    VISUAL_ARTIFACT = "visual_artifact"
    TEMPORAL = "temporal"
    AUDIO_INCONSISTENCY = "audio_inconsistency"


class SignalSeverity(enum.StrEnum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AnalyzerType(enum.StrEnum):
    AI_CONTENT = "ai_content"
    SIMILARITY = "similarity"
    PLAGIARISM = "plagiarism"
    AUTHENTICITY = "authenticity"
    LANGUAGE = "language"
    METADATA = "metadata"


class ModelProviderStatus(enum.StrEnum):
    DEVELOPMENT = "development"
    CANDIDATE = "candidate"
    STAGING = "staging"
    PRODUCTION = "production"
    RETIRED = "retired"


class ModelFramework(enum.StrEnum):
    PYTORCH = "pytorch"
    TENSORFLOW = "tensorflow"
    SKLEARN = "sklearn"
    ONNX = "onnx"
    TRANSFORMERS = "transformers"
    CUSTOM = "custom"


# ---------------------------------------------------------------------------
# Association: which analyzers are requested for a job
# ---------------------------------------------------------------------------


class AnalysisJobAnalyzer(Base):
    __tablename__ = "analysis_job_analyzers"

    job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs_v2.id"), primary_key=True)
    analyzer_type: Mapped[str] = mapped_column(String(30), primary_key=True)


# ---------------------------------------------------------------------------
# Analysis Job (v2)
# ---------------------------------------------------------------------------


class AnalysisJobV2(TimestampMixin, Base):
    __tablename__ = "analysis_jobs_v2"
    __table_args__ = (
        Index("idx_aj2_user", "user_id"),
        Index("idx_aj2_status", "status"),
        Index("idx_aj2_modality", "modality"),
        Index("idx_aj2_priority", "priority"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    media_asset_id: Mapped[str | None] = mapped_column(ForeignKey("media_assets.id"), nullable=True)
    input_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    modality: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=AnalysisStatus.PENDING.value, nullable=False)
    priority: Mapped[str] = mapped_column(String(10), default=AnalysisPriority.NORMAL.value, nullable=False)
    requested_analyzers: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_versions_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    analysis_configuration_id: Mapped[str | None] = mapped_column(ForeignKey("analysis_configurations.id"))
    preprocessing_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    feature_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    signals: Mapped[list[AnalysisSignal]] = relationship(back_populates="job")
    result: Mapped[AnalysisJobResult | None] = relationship(back_populates="job", uselist=False)
    events: Mapped[list[AnalysisPipelineEvent]] = relationship(back_populates="job")
    configuration: Mapped[AnalysisConfiguration | None] = relationship()


# ---------------------------------------------------------------------------
# Analysis Signal
# ---------------------------------------------------------------------------


class AnalysisSignal(TimestampMixin, Base):
    __tablename__ = "analysis_signals_v2"
    __table_args__ = (
        Index("idx_asig_job", "job_id"),
        Index("idx_asig_type", "signal_type"),
        Index("idx_asig_severity", "severity"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs_v2.id"), nullable=False)
    signal_type: Mapped[str] = mapped_column(String(30), nullable=False)
    analyzer_type: Mapped[str] = mapped_column(String(30), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(50), nullable=True)

    job: Mapped[AnalysisJobV2] = relationship(back_populates="signals")


# ---------------------------------------------------------------------------
# Analysis Job Result
# ---------------------------------------------------------------------------


class AnalysisJobResult(TimestampMixin, Base):
    __tablename__ = "analysis_job_results_v2"
    __table_args__ = (
        CheckConstraint(
            "model_version_id IS NOT NULL AND "
            "(dataset_version_id IS NOT NULL OR dataset_version_extended_id IS NOT NULL) AND "
            "preprocessing_version IS NOT NULL AND feature_version IS NOT NULL AND "
            "analysis_configuration_id IS NOT NULL",
            name="ck_analysis_result_provenance_complete",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs_v2.id"), unique=True, nullable=False)
    assessment: Mapped[str] = mapped_column(String(50), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    ai_content_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    model_probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    calibrated_probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    evidence_strength: Mapped[float | None] = mapped_column(Float, nullable=True)
    authenticity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    similarity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    plagiarism_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    limitations_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    processing_metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_version_id: Mapped[str | None] = mapped_column(ForeignKey("model_versions.id"))
    dataset_version_id: Mapped[str | None] = mapped_column(ForeignKey("dataset_versions.id"))
    dataset_version_extended_id: Mapped[str | None] = mapped_column(ForeignKey("dataset_versions_ext.id"))
    preprocessing_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    feature_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    analysis_configuration_id: Mapped[str | None] = mapped_column(ForeignKey("analysis_configurations.id"))
    result_timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    job: Mapped[AnalysisJobV2] = relationship(back_populates="result")
    model_version: Mapped[ModelVersion | None] = relationship()
    dataset_version: Mapped[DatasetVersion | None] = relationship()
    dataset_version_extended: Mapped[object | None] = relationship("DatasetVersionExtended")
    configuration: Mapped[AnalysisConfiguration | None] = relationship()


# ---------------------------------------------------------------------------
# Pipeline Event
# ---------------------------------------------------------------------------


class AnalysisPipelineEvent(TimestampMixin, Base):
    __tablename__ = "analysis_pipeline_events_v2"
    __table_args__ = (Index("idx_ape_job", "job_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs_v2.id"), nullable=False)
    step: Mapped[str] = mapped_column(String(50), nullable=False)
    analyzer_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    job: Mapped[AnalysisJobV2] = relationship(back_populates="events")


class AnalysisConfiguration(TimestampMixin, Base):
    __tablename__ = "analysis_configurations"
    __table_args__ = (Index("idx_analysis_config_task", "task"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    task: Mapped[str] = mapped_column(String(100), nullable=False)
    configuration_json: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    explanation_method: Mapped[str | None] = mapped_column(String(100), nullable=True)


# ---------------------------------------------------------------------------
# Model Registry
# ---------------------------------------------------------------------------


class ModelRegistry(TimestampMixin, Base):
    __tablename__ = "model_registry"
    __table_args__ = (Index("idx_mr_modality", "modality"), Index("idx_mr_task", "task"))

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    model_id: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    modality: Mapped[str] = mapped_column(String(20), nullable=False)
    task: Mapped[str] = mapped_column(String(50), nullable=False)
    framework: Mapped[str] = mapped_column(String(30), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=ModelProviderStatus.DEVELOPMENT.value, nullable=False)
    dataset_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    training_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    storage_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    f1_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    precision_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    recall_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    metrics_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    promoted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
