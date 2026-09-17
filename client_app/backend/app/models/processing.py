from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, generate_uuid


class ProcessingStatus(enum.StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ProcessingJobEvent(TimestampMixin, Base):
    __tablename__ = "processing_job_events"
    __table_args__ = (Index("idx_pje_job", "job_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    job_id: Mapped[str] = mapped_column(ForeignKey("processing_jobs.id"), nullable=False)
    step: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    details_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(nullable=True)

    job: Mapped[ProcessingJob] = relationship(back_populates="events")


class ProcessingJob(TimestampMixin, Base):
    __tablename__ = "processing_jobs"
    __table_args__ = (
        Index("idx_pjob_user", "user_id"),
        Index("idx_pjob_status", "status"),
        Index("idx_pjob_media", "media_asset_id"),
        Index("idx_pjob_retry", "status", "next_retry_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    media_asset_id: Mapped[str] = mapped_column(ForeignKey("media_assets.id"), nullable=False)
    modality: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=ProcessingStatus.QUEUED.value, nullable=False)
    progress: Mapped[int] = mapped_column(default=0, nullable=False)
    current_step: Mapped[str | None] = mapped_column(String(50), nullable=True)
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempt_count: Mapped[int] = mapped_column(default=0, nullable=False)
    max_retries: Mapped[int] = mapped_column(default=3, nullable=False)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    events: Mapped[list[ProcessingJobEvent]] = relationship(back_populates="job")
    artifacts: Mapped[list[ProcessingArtifact]] = relationship(back_populates="job", cascade="all, delete-orphan")


class ProcessingArtifact(TimestampMixin, Base):
    """A derived representation retained with its source-to-stage lineage."""

    __tablename__ = "processing_artifacts"
    __table_args__ = (
        Index("idx_partifact_job", "job_id"),
        Index("idx_partifact_source", "source_media_asset_id"),
        Index("idx_partifact_parent", "parent_artifact_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    job_id: Mapped[str] = mapped_column(ForeignKey("processing_jobs.id"), nullable=False)
    source_media_asset_id: Mapped[str] = mapped_column(ForeignKey("media_assets.id"), nullable=False)
    parent_artifact_id: Mapped[str | None] = mapped_column(ForeignKey("processing_artifacts.id"), nullable=True)
    stage: Mapped[str] = mapped_column(String(50), nullable=False)
    artifact_type: Mapped[str] = mapped_column(String(50), nullable=False)
    storage_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    job: Mapped[ProcessingJob] = relationship(back_populates="artifacts")
    parent: Mapped[ProcessingArtifact | None] = relationship(remote_side="ProcessingArtifact.id")
