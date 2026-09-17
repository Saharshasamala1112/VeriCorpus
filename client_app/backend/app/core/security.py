from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User, UserRole

ROLE_PERMISSIONS: dict[str, tuple[UserRole, ...]] = {
    "modify_datasets": (UserRole.ADMIN, UserRole.ML_ENGINEER),
    "approve_training_data": (UserRole.ADMIN, UserRole.ML_ENGINEER),
    "start_training": (UserRole.ADMIN, UserRole.ML_ENGINEER),
    "promote_models": (UserRole.ADMIN, UserRole.ML_ENGINEER),
    "rollback_models": (UserRole.ADMIN, UserRole.ML_ENGINEER),
    "change_providers": (UserRole.ADMIN,),
    "access_sensitive_corpus_data": (UserRole.ADMIN, UserRole.ML_ENGINEER),
}

security_scheme = HTTPBearer(auto_error=False)

# In-memory token blocklist. In production, use Redis or a database table.
# Stores jti (token ID) with expiry timestamp for automatic cleanup.
_token_blocklist: dict[str, float] = {}


def _cleanup_blocklist() -> None:
    now = datetime.now(UTC).timestamp()
    expired = [jti for jti, exp in _token_blocklist.items() if exp < now]
    for jti in expired:
        del _token_blocklist[jti]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, expires_delta: timedelta | None = None) -> str:
    expire = datetime.now(UTC) + (expires_delta or timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES))
    jti = secrets.token_urlsafe(32)
    payload = {"sub": user_id, "exp": expire, "iat": datetime.now(UTC), "jti": jti}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        jti = payload.get("jti")
        if jti and jti in _token_blocklist:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except HTTPException:
        raise
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def revoke_token(token: str) -> None:
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM], options={"verify_exp": False}
        )
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti and exp:
            _token_blocklist[jti] = exp
            _cleanup_blocklist()
    except JWTError:
        pass


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)],
    db: Annotated[AsyncSession | None, Depends(get_db)],
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    return user


async def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)],
    db: Annotated[AsyncSession | None, Depends(get_db)],
) -> User | None:
    if credentials is None or db is None:
        return None
    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if user_id is None:
            return None
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user and not user.is_active:
            return None
        return user
    except HTTPException:
        return None


def require_roles(*roles: UserRole):
    async def role_checker(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role: {', '.join(r.value for r in roles)}",
            )
        return current_user

    return role_checker


def require_permission(permission_name: str, *, allow_admin_override: bool = True):
    allowed_roles = ROLE_PERMISSIONS.get(permission_name, (UserRole.ADMIN,))

    async def permission_checker(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if current_user.role not in allowed_roles and (not allow_admin_override or current_user.role != UserRole.ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied for {permission_name}",
            )
        return current_user

    return permission_checker


def mask_secret(secret: str | None, *, visible_prefix: int = 2, visible_suffix: int = 2) -> str:
    if not secret:
        return ""
    if len(secret) <= visible_prefix + visible_suffix:
        return "***"
    return f"{secret[:visible_prefix]}...{secret[-visible_suffix:]}"


def safe_error_detail(exc: Exception, *, fallback: str = "Request failed") -> str:
    detail = str(exc).strip()
    if not detail:
        return fallback
    lowered = detail.lower()
    blocked = ("password", "secret", "token", "api_key", "jwt", "database_url", "connection string")
    if any(marker in lowered for marker in blocked):
        return fallback
    if len(detail) > 200:
        return detail[:197] + "..."
    return detail


async def get_admin_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


async def get_ml_engineer_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role not in (UserRole.ADMIN, UserRole.ML_ENGINEER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="ML Engineer access required")
    return current_user
