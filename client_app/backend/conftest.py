import os

import pytest

os.environ.setdefault("JWT_SECRET", "test-only-jwt-secret-for-suite")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://test:test-password@localhost:5432/test",
)
os.environ.setdefault(
    "CORPUS_DB_URL",
    "postgresql+asyncpg://test:test-password@localhost:5433/test-corpus",
)


@pytest.fixture
def sample_text():
    return "This is a sample text for analysis testing."


@pytest.fixture
def sample_file_content():
    return b"This is sample file content for testing."
