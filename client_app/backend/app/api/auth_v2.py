from __future__ import annotations

from datetime import datetime, UTC
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, get_current_user
from app.models.user import User, UserRole
from app.schemas.auth import (
    ChangePasswordRequest,
    CorpusAuthResponse,
    CorpusLoginRequest,
    CorpusOTPRequest,
    CorpusSignupRequest,
    CorpusStatusResponse,
    CorpusVerifyOTPRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    UserUpdateRequest,
)
from app.schemas.common import SuccessResponse
from app.services.audit_service import log_audit
from app.services.corpus_service import CorpusService

router = APIRouter(prefix="/auth", tags=["Authentication"])

corpus_service = CorpusService()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Register not available — use Corpus credentials to log in."""
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Direct registration is disabled. Please log in with your Corpus account credentials.",
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Authenticate against the Swecha Corpus API, then issue a local JWT."""
    from app.core.security import hash_password

    # 1. Verify credentials against the Corpus API
    corpus_result = await corpus_service.login_with_credentials(data.phone, data.password)
    corpus_token = corpus_result.get("access_token", "")

    # 2. Find or create local user
    result = await db.execute(select(User).where(User.phone == data.phone))
    user = result.scalar_one_or_none()

    if user is None:
        # Auto-create a local user from Corpus credentials
        user = User(
            phone=data.phone,
            username=data.phone,
            password_hash=hash_password(data.password),
            role=UserRole.USER,
            is_active=True,
            corpus_token=corpus_token,
            corpus_phone=data.phone,
        )
        db.add(user)
        await db.flush()
    else:
        # Update Corpus token on existing user
        user.corpus_token = corpus_token
        user.corpus_phone = data.phone

    user.last_login_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(user)

    await log_audit(
        db,
        user.id,
        "corpus_login",
        "user",
        user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
        phone=user.phone,
        roles=[user.role.value],
    )


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    await log_audit(
        db,
        current_user.id,
        "logout",
        "user",
        current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return {"message": "Logged out successfully"}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    token = create_access_token(current_user.id)
    await log_audit(
        db,
        current_user.id,
        "token_refresh",
        "user",
        current_user.id,
    )
    return TokenResponse(
        access_token=token,
        user_id=current_user.id,
        username=current_user.username,
        phone=current_user.phone,
        roles=[current_user.role.value],
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_me(
    data: UserUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    if data.username is not None:
        current_user.username = data.username
    if data.email is not None:
        current_user.email = data.email
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/change-password", response_model=SuccessResponse)
async def change_password(
    data: ChangePasswordRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    from app.core.security import hash_password, verify_password

    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = hash_password(data.new_password)
    await db.commit()
    return SuccessResponse(message="Password changed successfully")


# Admin user management
@router.get("/users", response_model=list[UserResponse])
async def list_users(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    from sqlalchemy import select

    result = await db.execute(select(User).limit(limit).offset(offset))
    return list(result.scalars().all())


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    data: UserUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    from sqlalchemy import select

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.username is not None:
        user.username = data.username
    if data.email is not None:
        user.email = data.email
    if data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    await db.commit()
    await db.refresh(user)
    return user


# ──────────────────────────────────────────────────────────────────────────────
# Corpus Authentication
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/corpus/login", response_model=CorpusAuthResponse)
async def corpus_login(
    data: CorpusLoginRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Link user's Corpus account using phone/password."""
    corpus_result = await corpus_service.login_with_credentials(data.phone, data.password)
    
    current_user.corpus_token = corpus_result["access_token"]
    current_user.corpus_phone = data.phone
    current_user.corpus_token_expires_at = datetime.now(UTC)
    await db.commit()
    
    await log_audit(
        db,
        current_user.id,
        "corpus_link",
        "user",
        current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    
    return CorpusAuthResponse(
        access_token=create_access_token(current_user.id),
        phone=data.phone,
        corpus_token=corpus_result["access_token"],
    )


@router.post("/corpus/send-login-otp")
async def corpus_send_login_otp(
    data: CorpusOTPRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Send login OTP to user's phone for Corpus authentication."""
    await corpus_service.send_login_otp(data.phone)
    return {"message": "OTP sent successfully", "phone": data.phone}


@router.post("/corpus/verify-login-otp", response_model=CorpusAuthResponse)
async def corpus_verify_login_otp(
    data: CorpusVerifyOTPRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Verify login OTP and link Corpus account."""
    corpus_result = await corpus_service.verify_login_otp(data.phone, data.otp_code)
    
    current_user.corpus_token = corpus_result.get("access_token")
    current_user.corpus_phone = data.phone
    current_user.corpus_token_expires_at = datetime.now(UTC)
    await db.commit()
    
    await log_audit(
        db,
        current_user.id,
        "corpus_link_otp",
        "user",
        current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    
    return CorpusAuthResponse(
        access_token=create_access_token(current_user.id),
        phone=data.phone,
        corpus_token=corpus_result.get("access_token", ""),
    )


@router.post("/corpus/send-signup-otp")
async def corpus_send_signup_otp(
    data: CorpusOTPRequest,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Send signup OTP to user's phone for Corpus authentication."""
    await corpus_service.send_signup_otp(data.phone)
    return {"message": "Signup OTP sent successfully", "phone": data.phone}


@router.post("/corpus/verify-signup-otp", response_model=CorpusAuthResponse)
async def corpus_verify_signup_otp(
    data: CorpusSignupRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Verify signup OTP and link Corpus account."""
    corpus_result = await corpus_service.verify_signup_otp(
        data.phone, data.otp_code, data.name or "", data.email or ""
    )
    
    current_user.corpus_token = corpus_result.get("access_token")
    current_user.corpus_phone = data.phone
    current_user.corpus_token_expires_at = datetime.now(UTC)
    await db.commit()
    
    await log_audit(
        db,
        current_user.id,
        "corpus_signup",
        "user",
        current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    
    return CorpusAuthResponse(
        access_token=create_access_token(current_user.id),
        phone=data.phone,
        corpus_token=corpus_result.get("access_token", ""),
    )


@router.post("/corpus/disconnect", response_model=SuccessResponse)
async def corpus_disconnect(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Disconnect user's Corpus account."""
    current_user.corpus_token = None
    current_user.corpus_phone = None
    current_user.corpus_token_expires_at = None
    await db.commit()
    
    await log_audit(
        db,
        current_user.id,
        "corpus_disconnect",
        "user",
        current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    
    return SuccessResponse(message="Corpus account disconnected")


@router.get("/corpus/status", response_model=CorpusStatusResponse)
async def corpus_status(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Get user's Corpus connection status."""
    return CorpusStatusResponse(
        connected=bool(current_user.corpus_token),
        corpus_phone=current_user.corpus_phone,
        token_expires_at=current_user.corpus_token_expires_at,
    )
