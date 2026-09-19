from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, generate_uuid

if TYPE_CHECKING:
    from .all_models import AnalysisJob, MediaAsset


class UserRole(enum.StrEnum):
    USER = "USER"
    REVIEWER = "REVIEWER"
    ADMIN = "ADMIN"
    ML_ENGINEER = "ML_ENGINEER"


class AuthProvider(enum.StrEnum):
    LOCAL = "local"
    CORPUS = "corpus"


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    full_name: Mapped[str] = mapped_column("username", String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(15), unique=True, nullable=False, index=True)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.USER, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Authentication provider
    auth_provider: Mapped[str] = mapped_column(
        String(10),
        default=AuthProvider.LOCAL.value,
        nullable=False,
        index=True,
    )
    corpus_user_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True, index=True)

    # Password reset
    reset_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reset_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Corpus integration (ephemeral token for API calls, not for auth)
    corpus_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    corpus_phone: Mapped[str | None] = mapped_column(String(15), nullable=True)
    corpus_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    media_assets: Mapped[list[MediaAsset]] = relationship(back_populates="owner", lazy="selectin")
    analysis_jobs: Mapped[list[AnalysisJob]] = relationship(back_populates="user", lazy="selectin")