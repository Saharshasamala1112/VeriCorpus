from __future__ import annotations

from datetime import datetime, UTC, timedelta
from typing import Annotated
import secrets
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.models.user import AuthProvider, User, UserRole
from app.schemas.auth import (
    ChangePasswordRequest,
    CorpusAuthResponse,
    CorpusLoginRequest,
    CorpusOTPRequest,
    CorpusSignupRequest,
    CorpusStandaloneLoginRequest,
    CorpusStatusResponse,
    CorpusVerifyOTPRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
    UserUpdateRequest,
)
from app.schemas.common import SuccessResponse
from app.services.audit_service import log_audit
from app.services.corpus_auth_provider import (
    CorpusAuthenticationError,
    CorpusServiceUnavailableError,
    CorpusAuthProvider,
)
from app.services.corpus_service import CorpusService
from app.services.email_service import send_password_reset_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

corpus_service = CorpusService()
corpus_auth_provider = CorpusAuthProvider()


def _normalize_token_response(user: User, access_token: str) -> TokenResponse:
    """Create a normalized token response for any authentication provider."""
    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        username=user.full_name,
        email=user.email,
        phone=user.phone,
        roles=[user.role.value],
        auth_provider=user.auth_provider,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Native VeriCorpus Authentication
# ──────────────────────────────────────────────────────────────────────────────


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Register a new native VeriCorpus user."""
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    # Validate country code
    from app.config.countries import get_country_by_code
    if not get_country_by_code(data.country_code.upper()):
        raise HTTPException(status_code=400, detail="Invalid country code")

    # Check if email already exists
    result = await db.execute(select(User).where(User.email == data.email.lower()))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    # Check if phone already exists
    result = await db.execute(select(User).where(User.phone == data.phone))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Phone number already registered")

    # Create user with local auth provider
    user = User(
        full_name=data.full_name,
        email=data.email.lower(),
        phone=data.phone,
        country_code=data.country_code.upper(),
        password_hash=hash_password(data.password),
        auth_provider=AuthProvider.LOCAL,
        role=UserRole.USER,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    await db.commit()
    await db.refresh(user)

    await log_audit(
        db,
        user.id,
        "register",
        "user",
        user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    token = create_access_token(user.id)
    return _normalize_token_response(user, token)


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Authenticate native VeriCorpus user with email/phone and password."""
    # Find user by email or phone (only local users or users with password)
    result = await db.execute(
        select(User).where(
            (User.email == data.identifier.lower()) | (User.phone == data.identifier)
        )
    )
    user = result.scalar_one_or_none()

    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        # Generic error to prevent account enumeration
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    user.last_login_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(user)

    await log_audit(
        db,
        user.id,
        "login",
        "user",
        user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    token = create_access_token(user.id)
    return _normalize_token_response(user, token)


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
    return _normalize_token_response(current_user, token)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_me(
    data: UserUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    if data.full_name is not None:
        current_user.full_name = data.full_name
    if data.email is not None:
        # Check if email is already taken
        result = await db.execute(select(User).where(User.email == data.email.lower(), User.id != current_user.id))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Email already in use")
        current_user.email = data.email.lower()
    if data.phone is not None:
        # Check if phone is already taken
        result = await db.execute(select(User).where(User.phone == data.phone, User.id != current_user.id))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Phone number already in use")
        current_user.phone = data.phone
    if data.country_code is not None:
        from app.config.countries import get_country_by_code
        if not get_country_by_code(data.country_code.upper()):
            raise HTTPException(status_code=400, detail="Invalid country code")
        current_user.country_code = data.country_code.upper()
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/change-password", response_model=SuccessResponse)
async def change_password(
    data: ChangePasswordRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    if not current_user.password_hash:
        raise HTTPException(
            status_code=400,
            detail="Cannot change password for Corpus-authenticated accounts"
        )
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = hash_password(data.new_password)
    await db.commit()
    return SuccessResponse(message="Password changed successfully")


@router.post("/forgot-password", response_model=SuccessResponse)
async def forgot_password(data: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Request password reset. Always returns success to prevent account enumeration."""
    result = await db.execute(select(User).where(User.email == data.email.lower()))
    user = result.scalar_one_or_none()

    # Always return generic success to prevent account enumeration
    if user and user.auth_provider == AuthProvider.LOCAL and user.password_hash:
        # Generate secure reset token
        reset_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + timedelta(hours=1)

        user.reset_token = reset_token
        user.reset_token_expires_at = expires_at
        await db.commit()

        # Send reset email (non-blocking)
        try:
            await send_password_reset_email(user.email, user.full_name, reset_token)
        except Exception:
            # Log error but don't expose to user
            pass

        await log_audit(
            db,
            user.id,
            "forgot_password",
            "user",
            user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )

    return SuccessResponse(
        message="If an account exists for this email, password reset instructions will be sent."
    )


@router.post("/reset-password", response_model=SuccessResponse)
async def reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Reset password with token."""
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    result = await db.execute(select(User).where(User.reset_token == data.token))
    user = result.scalar_one_or_none()

    if not user or not user.reset_token_expires_at or user.reset_token_expires_at < datetime.now(UTC):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    # Only allow password reset for local users
    if user.auth_provider != AuthProvider.LOCAL:
        raise HTTPException(
            status_code=400,
            detail="Password reset is not available for Corpus-authenticated accounts"
        )

    user.password_hash = hash_password(data.password)
    user.reset_token = None
    user.reset_token_expires_at = None
    await db.commit()

    await log_audit(
        db,
        user.id,
        "reset_password",
        "user",
        user.id,
    )

    return SuccessResponse(message="Password has been reset successfully. You can now sign in.")


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
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.email is not None:
        user.email = data.email.lower()
    if data.phone is not None:
        user.phone = data.phone
    if data.country_code is not None:
        from app.config.countries import get_country_by_code
        if not get_country_by_code(data.country_code.upper()):
            raise HTTPException(status_code=400, detail="Invalid country code")
        user.country_code = data.country_code.upper()
    if data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    await db.commit()
    await db.refresh(user)
    return user


# ──────────────────────────────────────────────────────────────────────────────
# Corpus Authentication - Standalone Login (No Existing Session Required)
# ──────────────────────────────────────────────────────────────────────────────


@router.post("/corpus/standalone-login", response_model=TokenResponse)
async def corpus_standalone_login(
    data: CorpusStandaloneLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate a Corpus user and create/map to VeriCorpus user.

    This endpoint allows existing Corpus users to sign in to VeriCorpus
    without having a pre-existing VeriCorpus account. It:

    1. Authenticates against the real Corpus API
    2. Looks for an existing VeriCorpus user mapped to this Corpus user
    3. If not found, creates a new VeriCorpus user
    4. Issues a VeriCorpus session token

    Security:
    - Corpus credentials are verified by the real Corpus API
    - Corpus passwords are never stored in VeriCorpus
    - corpus_user_id is the stable identity mapping (not email)
    - No automatic account merging based on email
    """
    try:
        # Step 1: Authenticate against real Corpus API
        corpus_identity = await corpus_auth_provider.authenticate(data.phone, data.password)
    except CorpusAuthenticationError as e:
        # Generic error to prevent account enumeration
        logger.info(f"Corpus standalone login failed: {e.message}")
        raise HTTPException(status_code=401, detail="Invalid Corpus credentials")
    except CorpusServiceUnavailableError as e:
        logger.warning(f"Corpus service unavailable during standalone login: {e.message}")
        raise HTTPException(
            status_code=503,
            detail="Corpus authentication service is temporarily unavailable. Please try again."
        )

    # Step 2: Look for existing VeriCorpus user mapped to this Corpus user
    result = await db.execute(
        select(User).where(
            User.auth_provider == AuthProvider.CORPUS,
            User.corpus_user_id == corpus_identity.provider_user_id,
        )
    )
    user = result.scalar_one_or_none()

    if user is None:
        # Step 3: Check if email is already used by a local user (prevent account takeover)
        if corpus_identity.email:
            existing_local = await db.execute(
                select(User).where(
                    User.email == corpus_identity.email.lower(),
                    User.auth_provider == AuthProvider.LOCAL,
                )
            )
            existing_user = existing_local.scalar_one_or_none()
            if existing_user:
                # Email collision: Corpus user has same email as local user
                # Do NOT auto-merge. Inform user to use local login or contact support.
                logger.warning(
                    f"Email collision: Corpus user {corpus_identity.provider_user_id} "
                    f"has email {corpus_identity.email} which belongs to local user {existing_user.id}"
                )
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "An account with this email already exists. "
                        "Please sign in with your VeriCorpus credentials or contact support."
                    )
                )

        # Step 4: Create new VeriCorpus user for this Corpus identity
        # For phone, use Corpus phone but ensure uniqueness
        corpus_phone = corpus_identity.phone
        if corpus_phone:
            existing_phone = await db.execute(
                select(User).where(User.phone == corpus_phone)
            )
            if existing_phone.scalar_one_or_none():
                # Phone already taken - append provider suffix to make unique
                corpus_phone = f"{corpus_phone}_corpus"

        # For email, use Corpus email but ensure uniqueness
        corpus_email = corpus_identity.email.lower() if corpus_identity.email else ""
        if corpus_email:
            existing_email = await db.execute(
                select(User).where(User.email == corpus_email)
            )
            if existing_email.scalar_one_or_none():
                # Email already taken - use corpus_user_id as email
                corpus_email = f"corpus_{corpus_identity.provider_user_id}@vericorpus.local"

        # If no email from Corpus, generate a placeholder
        if not corpus_email:
            corpus_email = f"corpus_{corpus_identity.provider_user_id}@vericorpus.local"

        # If no phone from Corpus, generate a placeholder
        if not corpus_phone:
            corpus_phone = f"corpus_{corpus_identity.provider_user_id}"

        user = User(
            full_name=corpus_identity.name or f"Corpus User {corpus_identity.provider_user_id[:8]}",
            email=corpus_email,
            phone=corpus_phone,
            country_code="IN",  # Default; Corpus doesn't provide country
            password_hash=None,  # No local password for Corpus users
            auth_provider=AuthProvider.CORPUS,
            corpus_user_id=corpus_identity.provider_user_id,
            role=UserRole.USER,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        logger.info(
            f"Created new VeriCorpus user for Corpus identity: {corpus_identity.provider_user_id}"
        )
    else:
        # Step 5: Returning user - update last login
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account disabled")

    # Update last login and store ephemeral Corpus token
    user.last_login_at = datetime.now(UTC)
    user.corpus_token = corpus_identity.raw_data.get("access_token") if corpus_identity.raw_data else None
    user.corpus_phone = data.phone
    user.corpus_token_expires_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(user)

    await log_audit(
        db,
        user.id,
        "corpus_standalone_login",
        "user",
        user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    token = create_access_token(user.id)
    return _normalize_token_response(user, token)


# ──────────────────────────────────────────────────────────────────────────────
# Corpus Authentication - Account Linking (Existing User)
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
