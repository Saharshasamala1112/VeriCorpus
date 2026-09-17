from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.user import UserRole


class RegisterRequest(BaseModel):
    phone: str = Field(..., min_length=10, max_length=15)
    username: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=6)
    email: str | None = None


class LoginRequest(BaseModel):
    phone: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str
    phone: str
    roles: list[str]


class UserResponse(BaseModel):
    id: str
    phone: str
    username: str
    email: str | None
    role: UserRole
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None
    corpus_connected: bool = False


class UserUpdateRequest(BaseModel):
    username: str | None = None
    email: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)


# Corpus Authentication Schemas
class CorpusLoginRequest(BaseModel):
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
