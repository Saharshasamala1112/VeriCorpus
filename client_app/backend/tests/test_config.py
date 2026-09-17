import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_debug_settings_allow_local_defaults() -> None:
    settings = Settings(DEBUG=True, _env_file=None)

    assert settings.JWT_SECRET


def test_default_settings_are_local_debug_mode() -> None:
    settings = Settings(_env_file=None)

    assert settings.DEBUG is True
    assert settings.JWT_SECRET


@pytest.mark.parametrize("scheme", ["postgres://", "postgresql://"])
def test_hosted_postgres_urls_use_asyncpg(scheme: str) -> None:
    settings = Settings(
        DATABASE_URL=f"{scheme}app:strong-password@db.example.com:5432/app",
        CORPUS_DB_URL=f"{scheme}app:strong-password@db.example.com:5432/corpus",
        _env_file=None,
    )

    assert settings.DATABASE_URL.startswith("postgresql+asyncpg://")
    assert settings.CORPUS_DB_URL.startswith("postgresql+asyncpg://")


def test_production_settings_reject_default_jwt_secret() -> None:
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        Settings(
            DEBUG=False,
            JWT_SECRET="dev-only-jwt-secret-change-me",
            DATABASE_URL="postgresql+asyncpg://app:strong-password@localhost:5432/app",
            CORPUS_DB_URL="postgresql+asyncpg://app:strong-password@localhost:5433/corpus",
            _env_file=None,
        )


def test_production_settings_reject_default_database_credentials() -> None:
    with pytest.raises(ValidationError, match="DATABASE_URL"):
        Settings(
            DEBUG=False,
            JWT_SECRET="a" * 64,
            DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/vericorpus",
            CORPUS_DB_URL="postgresql+asyncpg://app:strong-password@localhost:5433/corpus",
            _env_file=None,
        )
