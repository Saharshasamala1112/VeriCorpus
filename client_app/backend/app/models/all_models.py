from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, event, inspect
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, generate_uuid
from .user import User, UserRole  # noqa: F401

if TYPE_CHECKING:
    from .mlops import ModelVersionMetadata


class MediaAsset(TimestampMixin, Base):
    __tablename__ = "media_assets"
    __table_args__ = (Index("idx_media_owner", "owner_id"), Index("idx_media_type", "media_type"))

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    media_type: Mapped[str] = mapped_column(String(20), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="uploaded", nullable=False)

    owner: Mapped[User] = relationship(back_populates="media_assets")
    metadata_: Mapped[MediaMetadata | None] = relationship(back_populates="media_asset", uselist=False)
    corpus_item: Mapped[CorpusItem | None] = relationship(back_populates="media_asset", uselist=False)
    analysis_jobs: Mapped[list[AnalysisJob]] = relationship(back_populates="media_asset")


class MediaMetadata(TimestampMixin, Base):
    __tablename__ = "media_metadata"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    media_asset_id: Mapped[str] = mapped_column(ForeignKey("media_assets.id"), unique=True, nullable=False)
    width: Mapped[int | None] = mapped_column(nullable=True)
    height: Mapped[int | None] = mapped_column(nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(nullable=True)
    sample_rate: Mapped[int | None] = mapped_column(nullable=True)
    channels: Mapped[int | None] = mapped_column(nullable=True)
    codec: Mapped[str | None] = mapped_column(String(50), nullable=True)
    bit_rate: Mapped[int | None] = mapped_column(nullable=True)
    text_length: Mapped[int | None] = mapped_column(nullable=True)
    language_detected: Mapped[str | None] = mapped_column(String(10), nullable=True)
    extra: Mapped[str | None] = mapped_column(Text, nullable=True)

    media_asset: Mapped[MediaAsset] = relationship(back_populates="metadata_")


class CorpusItem(TimestampMixin, Base):
    __tablename__ = "corpus_items"
    __table_args__ = (Index("idx_corpus_status", "status"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    media_asset_id: Mapped[str | None] = mapped_column(ForeignKey("media_assets.id"), unique=True, nullable=True)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    source_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    label: Mapped[str | None] = mapped_column(String(50), nullable=True)
    label_confidence: Mapped[float | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    media_asset: Mapped[MediaAsset | None] = relationship(back_populates="corpus_item")
    dataset_versions: Mapped[list[DatasetVersion]] = relationship(
        back_populates="corpus_items", secondary="dataset_version_items"
    )


class Dataset(TimestampMixin, Base):
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_type: Mapped[str] = mapped_column(String(20), nullable=False)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    versions: Mapped[list[DatasetVersion]] = relationship(back_populates="dataset")


class DatasetVersion(TimestampMixin, Base):
    __tablename__ = "dataset_versions"
    __table_args__ = (UniqueConstraint("dataset_id", "version", name="uq_dataset_version_legacy"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sample_count: Mapped[int] = mapped_column(default=0, nullable=False)
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    is_sealed: Mapped[bool] = mapped_column(default=False, nullable=False)
    sealed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    dataset: Mapped[Dataset] = relationship(back_populates="versions")
    corpus_items: Mapped[list[CorpusItem]] = relationship(
        back_populates="dataset_versions", secondary="dataset_version_items"
    )
    training_runs: Mapped[list[TrainingRun]] = relationship(back_populates="dataset_version")


@event.listens_for(DatasetVersion, "before_update")
def reject_sealed_legacy_dataset_update(mapper, connection, target) -> None:
    if not target.is_sealed:
        return
    state = inspect(target)
    sealed_history = state.attrs.is_sealed.history
    if sealed_history.has_changes() and not any(sealed_history.deleted):
        return
    if any(attribute.history.has_changes() for attribute in state.attrs if attribute.key not in {"updated_at"}):
        raise ValueError("Sealed dataset versions are immutable; create a new version instead")


@event.listens_for(DatasetVersion, "before_delete")
def reject_legacy_dataset_version_delete(mapper, connection, target) -> None:
    raise ValueError("Dataset versions are immutable and cannot be deleted")


class DatasetVersionItem(Base):
    __tablename__ = "dataset_version_items"

    dataset_version_id: Mapped[str] = mapped_column(ForeignKey("dataset_versions.id"), primary_key=True)
    corpus_item_id: Mapped[str] = mapped_column(ForeignKey("corpus_items.id"), primary_key=True)


class AnalysisJob(TimestampMixin, Base):
    __tablename__ = "analysis_jobs"
    __table_args__ = (Index("idx_analysis_user", "user_id"), Index("idx_analysis_status", "status"))

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    media_asset_id: Mapped[str | None] = mapped_column(ForeignKey("media_assets.id"), nullable=True)
    input_type: Mapped[str] = mapped_column(String(20), nullable=False)
    input_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    pipeline_step: Mapped[str | None] = mapped_column(String(50), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    model_id: Mapped[str | None] = mapped_column(ForeignKey("model_versions.id"), nullable=True)

    user: Mapped[User] = relationship(back_populates="analysis_jobs")
    media_asset: Mapped[MediaAsset | None] = relationship(back_populates="analysis_jobs")
    result: Mapped[AnalysisResult | None] = relationship(back_populates="analysis_job", uselist=False)
    events: Mapped[list[ProcessingEvent]] = relationship(back_populates="analysis_job")
    model_version: Mapped[ModelVersion | None] = relationship()


class AnalysisResult(TimestampMixin, Base):
    __tablename__ = "analysis_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    analysis_job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs.id"), unique=True, nullable=False)
    ai_score: Mapped[float] = mapped_column(nullable=False)
    human_score: Mapped[float] = mapped_column(nullable=False)
    confidence: Mapped[float] = mapped_column(nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    signals: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    dataset_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    raw_output: Mapped[str | None] = mapped_column(Text, nullable=True)

    analysis_job: Mapped[AnalysisJob] = relationship(back_populates="result")
    explanation: Mapped[Explanation | None] = relationship(back_populates="analysis_result", uselist=False)


class Explanation(TimestampMixin, Base):
    __tablename__ = "explanations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    analysis_result_id: Mapped[str] = mapped_column(ForeignKey("analysis_results.id"), unique=True, nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    narrative: Mapped[str] = mapped_column(Text, nullable=False)
    key_factors: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommendations: Mapped[str | None] = mapped_column(Text, nullable=True)

    analysis_result: Mapped[AnalysisResult] = relationship(back_populates="explanation")


class Model(TimestampMixin, Base):
    __tablename__ = "models"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_type: Mapped[str] = mapped_column(String(20), nullable=False)
    architecture: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    versions: Mapped[list[ModelVersion]] = relationship(back_populates="model")


class ModelVersion(TimestampMixin, Base):
    __tablename__ = "model_versions"
    __table_args__ = (
        Index("idx_model_version_status", "status"),
        UniqueConstraint("model_id", "version", name="uq_model_version"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="development", nullable=False)
    accuracy: Mapped[float | None] = mapped_column(nullable=True)
    f1_score: Mapped[float | None] = mapped_column(nullable=True)
    precision_score: Mapped[float | None] = mapped_column(nullable=True)
    recall_score: Mapped[float | None] = mapped_column(nullable=True)
    training_run_id: Mapped[str | None] = mapped_column(ForeignKey("training_runs.id"), nullable=True)
    storage_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    metrics: Mapped[str | None] = mapped_column(Text, nullable=True)
    trained_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    model: Mapped[Model] = relationship(back_populates="versions")
    training_run: Mapped[TrainingRun | None] = relationship(back_populates="model_versions")
    extended_metadata: Mapped[ModelVersionMetadata | None] = relationship(
        "ModelVersionMetadata",
        back_populates="model_version",
        uselist=False,
        foreign_keys="ModelVersionMetadata.model_version_id",
    )


class TrainingJob(TimestampMixin, Base):
    __tablename__ = "training_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False)
    triggered_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    dataset_version_id: Mapped[str | None] = mapped_column(ForeignKey("dataset_versions.id"), nullable=True)
    config: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    training_runs: Mapped[list[TrainingRun]] = relationship(back_populates="training_job")


class TrainingRun(TimestampMixin, Base):
    __tablename__ = "training_runs"
    __table_args__ = (Index("idx_training_run_job", "training_job_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    training_job_id: Mapped[str | None] = mapped_column(ForeignKey("training_jobs.id"), nullable=True)
    dataset_version_id: Mapped[str | None] = mapped_column(ForeignKey("dataset_versions.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="running", nullable=False)
    sample_count: Mapped[int] = mapped_column(default=0, nullable=False)
    model_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    metrics: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    training_job: Mapped[TrainingJob | None] = relationship(back_populates="training_runs")
    dataset_version: Mapped[DatasetVersion | None] = relationship(back_populates="training_runs")
    model_versions: Mapped[list[ModelVersion]] = relationship(back_populates="training_run")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("idx_audit_user", "user_id"), Index("idx_audit_action", "action"))

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )


class ProcessingEvent(TimestampMixin, Base):
    __tablename__ = "processing_events"
    __table_args__ = (Index("idx_event_job", "analysis_job_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    analysis_job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs.id"), nullable=False)
    step: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(nullable=True)

    analysis_job: Mapped[AnalysisJob] = relationship(back_populates="events")
