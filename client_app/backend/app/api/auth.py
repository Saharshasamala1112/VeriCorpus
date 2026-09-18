from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, hash_password, revoke_token
from app.models.user import User, UserRole
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.services.corpus_service import CorpusService

router = APIRouter(prefix="/auth", tags=["Auth"])
bearer_scheme = HTTPBearer()
corpus_svc = CorpusService()


@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    raise HTTPException(
        status_code=403,
        detail="Direct registration is disabled. Please log in with your Corpus account credentials.",
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    if db is None:
        raise HTTPException(status_code=503, detail="Local account storage is unavailable")

    # Authenticate against Corpus API
    corpus_result = await corpus_svc.login_with_credentials(body.phone, body.password)
    corpus_token = corpus_result.get("access_token", "")

    # Find or create local user
    result = await db.execute(select(User).where(User.phone == body.phone))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            phone=body.phone,
            username=body.phone,
            password_hash=hash_password(body.password),
            role=UserRole.USER,
            is_active=True,
            corpus_token=corpus_token,
            corpus_phone=body.phone,
        )
        db.add(user)
        await db.flush()
    else:
        user.corpus_token = corpus_token
        user.corpus_phone = body.phone

    user.last_login_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
        phone=user.phone,
        roles=[user.role.value],
    )


@router.post("/logout")
async def logout(credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)]):
    revoke_token(credentials.credentials)
    return {"detail": "Token revoked"}
