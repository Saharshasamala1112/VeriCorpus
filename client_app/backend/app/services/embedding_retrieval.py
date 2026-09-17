"""Provider-independent embedding and vector retrieval services."""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
import sqlite3
import threading
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.intelligence import DocumentChunk, Embedding, EmbeddingVersion


@dataclass(frozen=True)
class EmbeddingSpec:
    provider: str
    model: str
    model_version: str
    dimensions: int
    preprocessing_version: str


@dataclass(frozen=True)
class VectorRecord:
    key: str
    vector: list[float]
    metadata: dict[str, Any]


@dataclass(frozen=True)
class SearchHit:
    key: str
    score: float
    metadata: dict[str, Any]


class EmbeddingProvider(ABC):
    """Provider contract; implementations may wrap local or hosted models."""

    @property
    @abstractmethod
    def spec(self) -> EmbeddingSpec: ...

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class HashEmbeddingProvider(EmbeddingProvider):
    """Deterministic local baseline for development and reproducible indexing."""

    def __init__(self, dimensions: int = 128, model_version: str = "1") -> None:
        self._spec = EmbeddingSpec("local", "hashing", model_version, dimensions, "1.0.0")

    @property
    def spec(self) -> EmbeddingSpec:
        return self._spec

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return await asyncio.to_thread(self._embed_sync, texts)

    def _embed_sync(self, texts: list[str]) -> list[list[float]]:
        vectors = []
        for text in texts:
            vector = [0.0] * self.spec.dimensions
            tokens = text.lower().split()
            for token in tokens:
                digest = hashlib.sha256(token.encode("utf-8")).digest()
                index = int.from_bytes(digest[:4], "big") % self.spec.dimensions
                vector[index] += 1.0
            norm = math.sqrt(sum(value * value for value in vector)) or 1.0
            vectors.append([value / norm for value in vector])
        return vectors


class MultilingualHashEmbeddingProvider(EmbeddingProvider):
    """Hash-based embedding provider with Unicode-aware tokenization.

    Uses language-aware tokenization from the NLP module to properly handle
    Indic scripts (Devanagari, Telugu, Tamil, Kannada, Malayalam) which do
    not use spaces between words. Includes character n-gram features for
    better cross-lingual similarity.

    Falls back to this when a real multilingual embedding model is unavailable.
    """

    def __init__(self, dimensions: int = 128, model_version: str = "3") -> None:
        self._spec = EmbeddingSpec("local", "hashing-multilingual", model_version, dimensions, "2.0.0")

    @property
    def spec(self) -> EmbeddingSpec:
        return self._spec

    async def embed(self, texts: list[str], language: str = "en") -> list[list[float]]:
        return await asyncio.to_thread(self._embed_sync, texts, language)

    def _embed_sync(self, texts: list[str], language: str = "en") -> list[list[float]]:
        from app.i18n.nlp import tokenize

        vectors = []
        for text in texts:
            tokens = tokenize(text, language)
            vector = [0.0] * self.spec.dimensions

            for token in tokens:
                digest = hashlib.sha256(token.encode("utf-8")).digest()
                index = int.from_bytes(digest[:4], "big") % self.spec.dimensions
                vector[index] += 1.0

            for token in tokens:
                if len(token) >= 2:
                    for i in range(len(token) - 1):
                        bigram = token[i : i + 2]
                        digest = hashlib.sha256(bigram.encode("utf-8")).digest()
                        index = int.from_bytes(digest[:4], "big") % self.spec.dimensions
                        vector[index] += 0.5

            for token in tokens:
                if len(token) >= 3:
                    for i in range(len(token) - 2):
                        trigram = token[i : i + 3]
                        digest = hashlib.sha256(trigram.encode("utf-8")).digest()
                        index = int.from_bytes(digest[:4], "big") % self.spec.dimensions
                        vector[index] += 0.25

            norm = math.sqrt(sum(value * value for value in vector)) or 1.0
            vectors.append([value / norm for value in vector])
        return vectors


class VectorStore(ABC):
    @abstractmethod
    async def upsert(self, records: list[VectorRecord]) -> None: ...

    @abstractmethod
    async def search(
        self,
        vector: list[float],
        *,
        top_k: int = 10,
        threshold: float = 0.0,
        filters: dict[str, Any] | None = None,
    ) -> list[SearchHit]: ...

    @abstractmethod
    async def delete(self, keys: list[str]) -> None: ...


class LocalVectorStore(VectorStore):
    """Persistent SQLite vector store with a replaceable provider boundary.

    The store uses exact cosine search for portability and small deployments.
    A FAISS-backed implementation can satisfy the same interface later.
    """

    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path or settings.VECTOR_STORE_PATH)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_schema(self) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS vectors (
                    key TEXT PRIMARY KEY,
                    vector_json TEXT NOT NULL,
                    metadata_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    async def upsert(self, records: list[VectorRecord]) -> None:
        def write() -> None:
            from datetime import UTC, datetime

            with self._lock, self._connect() as connection:
                connection.executemany(
                    """
                    INSERT INTO vectors(key, vector_json, metadata_json, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET
                        vector_json=excluded.vector_json,
                        metadata_json=excluded.metadata_json,
                        updated_at=excluded.updated_at
                    """,
                    [
                        (
                            record.key,
                            json.dumps(record.vector),
                            json.dumps(record.metadata, sort_keys=True),
                            datetime.now(UTC).isoformat(),
                        )
                        for record in records
                    ],
                )

        await asyncio.to_thread(write)

    async def delete(self, keys: list[str]) -> None:
        def remove() -> None:
            with self._lock, self._connect() as connection:
                connection.executemany("DELETE FROM vectors WHERE key = ?", [(key,) for key in keys])

        await asyncio.to_thread(remove)

    async def search(
        self,
        vector: list[float],
        *,
        top_k: int = 10,
        threshold: float = 0.0,
        filters: dict[str, Any] | None = None,
    ) -> list[SearchHit]:
        def read() -> list[SearchHit]:
            with self._lock, self._connect() as connection:
                rows = connection.execute("SELECT key, vector_json, metadata_json FROM vectors").fetchall()
            results = []
            for row in rows:
                metadata = json.loads(row["metadata_json"])
                if filters and any(metadata.get(key) != value for key, value in filters.items()):
                    continue
                candidate = json.loads(row["vector_json"])
                score = self._cosine(vector, candidate)
                if score >= threshold:
                    results.append(SearchHit(row["key"], score, metadata))
            return sorted(results, key=lambda hit: hit.score, reverse=True)[:top_k]

        return await asyncio.to_thread(read)

    @staticmethod
    def _cosine(left: list[float], right: list[float]) -> float:
        if len(left) != len(right):
            return 0.0
        denominator = math.sqrt(sum(value * value for value in left)) * math.sqrt(sum(value * value for value in right))
        return sum(a * b for a, b in zip(left, right)) / denominator if denominator else 0.0


class EmbeddingRegistry:
    def __init__(self) -> None:
        self._providers: dict[tuple[str, str, str], EmbeddingProvider] = {}

    def register(self, provider: EmbeddingProvider) -> None:
        spec = provider.spec
        self._providers[(spec.provider, spec.model, spec.model_version)] = provider

    def get(self, provider: str, model: str, model_version: str) -> EmbeddingProvider:
        try:
            return self._providers[(provider, model, model_version)]
        except KeyError as exc:
            raise ValueError(f"Embedding provider version not registered: {provider}/{model}/{model_version}") from exc


class VectorIndexManager:
    def __init__(
        self,
        db: AsyncSession,
        registry: EmbeddingRegistry | None = None,
        store: VectorStore | None = None,
    ) -> None:
        self.db = db
        self.registry = registry or EmbeddingRegistry()
        self.store = store or LocalVectorStore()
        if not self.registry._providers:
            self.registry.register(HashEmbeddingProvider())
            self.registry.register(MultilingualHashEmbeddingProvider())

    async def ensure_version(self, provider: EmbeddingProvider) -> EmbeddingVersion:
        spec = provider.spec
        result = await self.db.execute(
            select(EmbeddingVersion).where(
                EmbeddingVersion.provider == spec.provider,
                EmbeddingVersion.model == spec.model,
                EmbeddingVersion.model_version == spec.model_version,
            )
        )
        version = result.scalar_one_or_none()
        if version is None:
            version = EmbeddingVersion(
                provider=spec.provider,
                model=spec.model,
                model_version=spec.model_version,
                dimensions=spec.dimensions,
                preprocessing_version=spec.preprocessing_version,
                configuration_json="{}",
            )
            self.db.add(version)
            await self.db.flush()
        return version

    async def embed_chunks(
        self,
        chunks: list[DocumentChunk],
        provider: EmbeddingProvider,
        *,
        batch_size: int = 32,
    ) -> list[Embedding]:
        await self.ensure_version(provider)
        spec = provider.spec
        persisted: list[Embedding] = []
        for start in range(0, len(chunks), batch_size):
            batch = chunks[start : start + batch_size]
            vectors = await provider.embed([chunk.content for chunk in batch])
            records = []
            for chunk, vector in zip(batch, vectors):
                key = f"{spec.provider}:{spec.model}:{spec.model_version}:chunk:{chunk.id}"
                embedding = Embedding(
                    document_chunk_id=chunk.id,
                    embedding_model=spec.model,
                    embedding_version=spec.model_version,
                    provider=spec.provider,
                    model=spec.model,
                    model_version=spec.model_version,
                    preprocessing_version=spec.preprocessing_version,
                    vector_store="local",
                    vector_key=key,
                    dimensions=len(vector),
                    vector_json=json.dumps(vector),
                )
                self.db.add(embedding)
                persisted.append(embedding)
                records.append(
                    VectorRecord(
                        key,
                        vector,
                        {
                            "chunk_id": chunk.id,
                            "media_asset_id": chunk.media_asset_id,
                            "text": chunk.content,
                            "title": f"Chunk {chunk.chunk_index}",
                        },
                    )
                )
            await self.store.upsert(records)
        await self.db.flush()
        return persisted

    async def index_chunks(
        self,
        chunks: list[DocumentChunk],
        provider: EmbeddingProvider,
        *,
        batch_size: int = 32,
    ) -> list[Embedding]:
        """Incrementally index only chunks missing this provider version."""
        spec = provider.spec
        result = await self.db.execute(
            select(Embedding.document_chunk_id).where(
                Embedding.document_chunk_id.in_([chunk.id for chunk in chunks]),
                Embedding.provider == spec.provider,
                Embedding.model == spec.model,
                Embedding.model_version == spec.model_version,
            )
        )
        existing = {row[0] for row in result.all()}
        pending = [chunk for chunk in chunks if chunk.id not in existing]
        return await self.embed_chunks(pending, provider, batch_size=batch_size) if pending else []

    async def reindex_chunks(
        self,
        chunks: list[DocumentChunk],
        provider: EmbeddingProvider,
        *,
        batch_size: int = 32,
    ) -> list[Embedding]:
        existing = await self.db.execute(
            select(Embedding).where(
                Embedding.document_chunk_id.in_([chunk.id for chunk in chunks]),
            )
        )
        old = list(existing.scalars())
        await self.store.delete([embedding.vector_key for embedding in old])
        for embedding in old:
            await self.db.delete(embedding)
        await self.db.flush()
        return await self.embed_chunks(chunks, provider, batch_size=batch_size)

    async def semantic_search(
        self,
        query: str,
        provider: EmbeddingProvider,
        *,
        top_k: int = 10,
        threshold: float = 0.0,
        filters: dict[str, Any] | None = None,
    ) -> list[SearchHit]:
        vector = (await provider.embed([query]))[0]
        return await self.store.search(vector, top_k=top_k, threshold=threshold, filters=filters)


def recall_at_k(results: list[SearchHit], relevant_keys: set[str], k: int) -> float:
    """Evaluate retrieval recall for a single query without fabricating relevance."""
    if not relevant_keys:
        return 0.0
    retrieved = {hit.key for hit in results[:k]}
    return len(retrieved & relevant_keys) / len(relevant_keys)


class MultilingualEmbeddingService:
    """High-level service for language-aware multilingual embeddings.

    Automatically selects the appropriate embedding provider and preprocessing
    based on the detected or specified language. Provides fallback chains
    when a language-specific model is unavailable.
    """

    def __init__(self, registry: EmbeddingRegistry | None = None) -> None:
        self.registry = registry or EmbeddingRegistry()
        if not self.registry._providers:
            self.registry.register(HashEmbeddingProvider())
            self.registry.register(MultilingualHashEmbeddingProvider())

    def get_provider(self, language: str = "en") -> EmbeddingProvider:
        """Get the best available embedding provider for a language."""
        from app.core.language_config import get_profile

        profile = get_profile(language)
        if profile.embedding_model_available:
            try:
                return self.registry.get("local", "hashing-multilingual", "3")
            except ValueError:
                pass
        return MultilingualHashEmbeddingProvider()

    async def embed_texts(
        self,
        texts: list[str],
        language: str = "en",
    ) -> list[list[float]]:
        """Embed a list of texts with language-aware preprocessing.

        Args:
            texts: List of text strings to embed.
            language: ISO 639-1 language code for tokenization.

        Returns:
            List of embedding vectors, one per input text.
        """
        provider = self.get_provider(language)
        if isinstance(provider, MultilingualHashEmbeddingProvider):
            return await provider.embed(texts, language)
        return await provider.embed(texts)

    async def embed_query(
        self,
        query: str,
        language: str = "en",
    ) -> list[float]:
        """Embed a single query with language-aware preprocessing."""
        vectors = await self.embed_texts([query], language)
        return vectors[0]

    async def similarity_search(
        self,
        query: str,
        vector_manager: VectorIndexManager,
        language: str = "en",
        *,
        top_k: int = 10,
        threshold: float = 0.0,
        filters: dict[str, Any] | None = None,
    ) -> list[SearchHit]:
        """Perform a language-aware semantic search."""
        provider = self.get_provider(language)
        return await vector_manager.semantic_search(query, provider, top_k=top_k, threshold=threshold, filters=filters)
