from __future__ import annotations

import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.models.all_models import Dataset
from app.models.base import Base
from app.models.corpus_intelligence import (
    CorpusDuplicate,
    CorpusItemExtended,
    CorpusItemStatus,
    DatasetVersionItemExt,
    DuplicateType,
)
from app.models.user import User, UserRole
from app.services.corpus_dataset_builder import CorpusDatasetBuilder


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSession(engine) as session:
        yield session
    await engine.dispose()


async def _user(db: AsyncSession) -> User:
    user = User(phone="5555555555", username="builder-user", password_hash="hash", role=UserRole.ML_ENGINEER)
    db.add(user)
    await db.flush()
    return user


async def _item(db: AsyncSession, suffix: str, user_id: str) -> CorpusItemExtended:
    item = CorpusItemExtended(
        media_type="text",
        source="verified-source",
        content_hash=f"hash-{suffix}",
        language="en",
        title=f"Item {suffix}",
        label="human",
        status=CorpusItemStatus.APPROVED.value,
        quality_status="passed",
        quality_score=0.95,
        training_eligible=True,
        created_by=user_id,
    )
    db.add(item)
    await db.flush()
    return item


async def test_builder_excludes_duplicate_groups_from_split_leakage(db_session: AsyncSession):
    user = await _user(db_session)
    user_id = user.id
    dataset = Dataset(name="builder-dataset", media_type="text", created_by=user_id)
    db_session.add(dataset)
    await db_session.flush()
    dataset_id = dataset.id
    first = await _item(db_session, "one", user_id)
    duplicate = await _item(db_session, "two", user_id)
    independent = await _item(db_session, "three", user_id)
    duplicate_group_ids = {first.id, duplicate.id}
    independent_id = independent.id
    db_session.add(
        CorpusDuplicate(
            corpus_item_id_a=first.id,
            corpus_item_id_b=duplicate.id,
            duplicate_type=DuplicateType.NEAR.value,
            similarity_score=0.97,
            detected_by="test",
        )
    )
    await db_session.commit()

    version = await CorpusDatasetBuilder().create_next_dataset_version(dataset_id, db_session, created_by=user_id)
    links = (
        (
            await db_session.execute(
                select(DatasetVersionItemExt).where(DatasetVersionItemExt.dataset_version_id == version.id)
            )
        )
        .scalars()
        .all()
    )
    assert version.fingerprint
    assert version.corpus_snapshot
    assert version.split_counts
    assert len(links) == 3
    grouped = {link.split for link in links if link.corpus_item_id in duplicate_group_ids}
    assert len(grouped) == 1
    assert independent_id in {link.corpus_item_id for link in links}
