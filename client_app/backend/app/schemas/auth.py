from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, EmailStr

from app.models.user import AuthProvider, UserRole


class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., min_length=10, max_length=15)
    country_code: str = Field(..., min_length=2, max_length=2)
    password: str = Field(..., min_length=8)
    confirm_password: str = Field(..., min_length=8)


class LoginRequest(BaseModel):
    identifier: str = Field(..., min_length=1)
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str
    email: str
    phone: str
    roles: list[str]
    auth_provider: str = "local"


class UserResponse(BaseModel):
    id: str
    full_name: str
    email: str
    phone: str
    country_code: str
    role: UserRole
    is_active: bool
    auth_provider: str
    created_at: datetime
    last_login_at: datetime | None
    corpus_connected: bool = False


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    country_code: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(..., min_length=8)
    confirm_password: str = Field(..., min_length=8)


# ──────────────────────────────────────────────────────────────────────────────
# Corpus Authentication Schemas (Standalone Login)
# ──────────────────────────────────────────────────────────────────────────────

class CorpusStandaloneLoginRequest(BaseModel):
    """Request for standalone Corpus login (no existing VeriCorpus session required)."""

    phone: str = Field(..., min_length=10, max_length=15, description="Corpus phone number")
    password: str = Field(..., min_length=1, description="Corpus password")


# ──────────────────────────────────────────────────────────────────────────────
# Corpus Linking Schemas (Existing User Linking)
# ──────────────────────────────────────────────────────────────────────────────

class CorpusLoginRequest(BaseModel):
    """Request for linking Corpus account to existing VeriCorpus user."""

    phone: str
    password: str


class CorpusOTPRequest(BaseModel):
    phone: str


class CorpusVerifyOTPRequest(BaseModel):
    phone: str
    otp_code: str


class CorpusSignupRequest(BaseModel):
    phone: str
    otp_code: str
    name: str | None = None
    email: str | None = None


class CorpusAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    phone: str
    corpus_token: str


class CorpusStatusResponse(BaseModel):
    connected: bool
    corpus_phone: str | None = None
    token_expires_at: datetime | None = None