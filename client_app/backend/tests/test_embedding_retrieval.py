from __future__ import annotations

from pathlib import Path

import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.models.all_models import MediaAsset
from app.models.base import Base
from app.models.intelligence import DocumentChunk, Embedding
from app.models.user import User, UserRole
from app.services.embedding_retrieval import (
    EmbeddingRegistry,
    HashEmbeddingProvider,
    LocalVectorStore,
    VectorIndexManager,
    recall_at_k,
)


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSession(engine) as session:
        yield session
    await engine.dispose()


async def _chunks(db: AsyncSession) -> list[DocumentChunk]:
    user = User(phone="8888888888", username="embedding-user", password_hash="hash", role=UserRole.USER)
    db.add(user)
    await db.flush()
    asset = MediaAsset(
        owner_id=user.id,
        media_type="document",
        filename="doc.pdf",
        original_filename="doc.pdf",
        mime_type="application/pdf",
        file_size=100,
        storage_path="uploads/doc.pdf",
        sha256="b" * 64,
    )
    db.add(asset)
    await db.flush()
    chunks = [
        DocumentChunk(media_asset_id=asset.id, chunk_index=0, content="cats and dogs"),
        DocumentChunk(media_asset_id=asset.id, chunk_index=1, content="quantum physics"),
    ]
    db.add_all(chunks)
    await db.flush()
    return chunks


async def test_batch_indexing_and_filtered_semantic_search(tmp_path: Path, db_session: AsyncSession):
    chunks = await _chunks(db_session)
    provider = HashEmbeddingProvider(dimensions=64)
    registry = EmbeddingRegistry()
    registry.register(provider)
    manager = VectorIndexManager(
        db_session,
        registry=registry,
        store=LocalVectorStore(tmp_path / "vectors.sqlite3"),
    )

    embeddings = await manager.embed_chunks(chunks, provider, batch_size=1)
    assert len(embeddings) == 2
    assert all(item.provider == "local" and item.dimensions == 64 for item in embeddings)

    hits = await manager.semantic_search("cats", provider, top_k=2, threshold=0.1)
    assert hits
    assert hits[0].metadata["chunk_id"] == chunks[0].id

    filtered = await manager.semantic_search("cats", provider, filters={"media_asset_id": chunks[0].media_asset_id})
    assert len(filtered) == 2
    assert recall_at_k(hits, {hits[0].key}, 1) == 1.0


async def test_reindexing_replaces_model_version(db_session: AsyncSession, tmp_path: Path):
    chunks = await _chunks(db_session)
    chunk_ids = [chunk.id for chunk in chunks]
    manager = VectorIndexManager(db_session, store=LocalVectorStore(tmp_path / "vectors.sqlite3"))
    first = HashEmbeddingProvider(dimensions=32, model_version="1")
    second = HashEmbeddingProvider(dimensions=48, model_version="2")
    await manager.embed_chunks(chunks, first)
    await manager.reindex_chunks(chunks, second)
    await db_session.commit()

    rows = (
        (await db_session.execute(select(Embedding).where(Embedding.document_chunk_id.in_(chunk_ids)))).scalars().all()
    )
    assert {row.model_version for row in rows} == {"2"}
    assert {row.dimensions for row in rows} == {48}


async def test_incremental_indexing_skips_existing_chunks(db_session: AsyncSession, tmp_path: Path):
    chunks = await _chunks(db_session)
    manager = VectorIndexManager(db_session, store=LocalVectorStore(tmp_path / "vectors.sqlite3"))
    provider = HashEmbeddingProvider(dimensions=16)
    first = await manager.index_chunks(chunks, provider)
    second = await manager.index_chunks(chunks, provider)
    assert len(first) == 2
    assert second == []
