"""Duplicate Detection - Exact and near-duplicate detection for corpus items.

Uses cryptographic hashes for exact duplicate detection and provides an
extensible abstraction for near-duplicate detection using embeddings/features.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.corpus_intelligence import CorpusDuplicate, DuplicateType

logger = logging.getLogger(__name__)


@dataclass
class DuplicateResult:
    """Result of a duplicate check."""

    is_duplicate: bool
    duplicate_type: DuplicateType | None = None
    similarity_score: float | None = None
    duplicate_of_id: str | None = None
    details: str | None = None


class NearDuplicateDetector(ABC):
    """Abstract base class for near-duplicate detection strategies.

    Implementations should use embeddings, locality-sensitive hashing,
    MinHash, or other similarity techniques. Do NOT claim semantic
    similarity using a simple hash.
    """

    @abstractmethod
    async def compute_fingerprint(self, content: bytes | str, media_type: str) -> list[float]:
        """Compute a fingerprint/embedding for the given content.

        Args:
            content: Raw bytes or text content.
            media_type: The media type (text, image, audio, video).

        Returns:
            A list of floats representing the embedding vector.
        """
        ...

    @abstractmethod
    async def similarity(self, fp_a: list[float], fp_b: list[float]) -> float:
        """Compute similarity between two fingerprints.

        Returns:
            A float between 0.0 and 1.0, where 1.0 means identical.
        """
        ...

    @abstractmethod
    async def find_near_duplicates(
        self, fingerprint: list[float], threshold: float, candidates: list[tuple[str, list[float]]]
    ) -> list[tuple[str, float]]:
        """Find near-duplicates from a set of candidates.

        Args:
            fingerprint: The query fingerprint.
            threshold: Minimum similarity threshold (0.0 to 1.0).
            candidates: List of (item_id, candidate_fingerprint) tuples.

        Returns:
            List of (item_id, similarity_score) above threshold, sorted descending.
        """
        ...


class HashBasedNearDuplicate(NearDuplicateDetector):
    """Simple hash-based near-duplicate detector using cosine similarity.

    This is a basic implementation using TF-IDF style vectorization.
    For production, use a proper embedding model (Sentence-BERT, CLIP, etc.)
    and a vector store (FAISS, Pinecone, Weaviate, etc.).
    """

    def __init__(self, ngram_size: int = 3):
        self.ngram_size = ngram_size

    def _text_to_ngrams(self, text: str) -> dict[str, int]:
        """Convert text to character n-gram frequency vector."""
        text = text.lower().strip()
        ngrams: dict[str, int] = {}
        for i in range(len(text) - self.ngram_size + 1):
            ngram = text[i : i + self.ngram_size]
            ngrams[ngram] = ngrams.get(ngram, 0) + 1
        return ngrams

    def _cosine_similarity(self, vec_a: dict[str, int], vec_b: dict[str, int]) -> float:
        """Compute cosine similarity between two sparse vectors."""
        keys = set(vec_a.keys()) & set(vec_b.keys())
        if not keys:
            return 0.0

        dot = sum(vec_a[k] * vec_b[k] for k in keys)
        norm_a = sum(v**2 for v in vec_a.values()) ** 0.5
        norm_b = sum(v**2 for v in vec_b.values()) ** 0.5

        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    async def compute_fingerprint(self, content: bytes | str, media_type: str) -> list[float]:
        if isinstance(content, bytes):
            content = content.decode("utf-8", errors="replace")
        ngrams = self._text_to_ngrams(content)
        if not ngrams:
            return []
        sorted_keys = sorted(ngrams.keys())
        return [float(ngrams[k]) for k in sorted_keys]

    async def similarity(self, fp_a: list[float], fp_b: list[float]) -> float:
        if not fp_a or not fp_b:
            return 0.0
        dot = sum(a * b for a, b in zip(fp_a, fp_b))
        norm_a = sum(a**2 for a in fp_a) ** 0.5
        norm_b = sum(b**2 for b in fp_b) ** 0.5
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    async def find_near_duplicates(
        self, fingerprint: list[float], threshold: float, candidates: list[tuple[str, list[float]]]
    ) -> list[tuple[str, float]]:
        results = []
        for item_id, candidate_fp in candidates:
            sim = await self.similarity(fingerprint, candidate_fp)
            if sim >= threshold:
                results.append((item_id, sim))
        results.sort(key=lambda x: x[1], reverse=True)
        return results


class DuplicateDetectionService:
    """Service for detecting exact and near-duplicates across the corpus.

    Uses content hashes (SHA-256) for exact matching and a pluggable
    NearDuplicateDetector for similarity-based matching.
    """

    def __init__(self, near_duplicate_detector: NearDuplicateDetector | None = None):
        self.near_detector = near_duplicate_detector or HashBasedNearDuplicate()

    async def check_exact_duplicate(
        self, content_hash: str, exclude_item_id: str | None = None, db: AsyncSession | None = None
    ) -> DuplicateResult:
        """Check if a corpus item with the same content hash exists.

        Args:
            content_hash: SHA-256 hex digest of the content.
            exclude_item_id: Optional item ID to exclude from the search (for self-checks).
            db: Database session.

        Returns:
            DuplicateResult indicating if an exact duplicate exists.
        """
        if db is None:
            return DuplicateResult(is_duplicate=False)

        from app.models.corpus_intelligence import CorpusItemExtended

        query = select(CorpusItemExtended).where(CorpusItemExtended.content_hash == content_hash)
        if exclude_item_id:
            query = query.where(CorpusItemExtended.id != exclude_item_id)

        result = await db.execute(query)
        existing = result.scalar_one_or_none()

        if existing is not None:
            return DuplicateResult(
                is_duplicate=True,
                duplicate_type=DuplicateType.EXACT,
                similarity_score=1.0,
                duplicate_of_id=existing.id,
                details=f"Exact duplicate found: content_hash={content_hash[:16]}...",
            )

        return DuplicateResult(is_duplicate=False)

    async def record_duplicate(
        self,
        item_id_a: str,
        item_id_b: str,
        duplicate_type: DuplicateType,
        similarity_score: float | None = None,
        detected_by: str | None = None,
        details: str | None = None,
        db: AsyncSession | None = None,
    ) -> CorpusDuplicate | None:
        """Record a duplicate relationship in the database."""
        if db is None:
            return None

        dup = CorpusDuplicate(
            corpus_item_id_a=item_id_a,
            corpus_item_id_b=item_id_b,
            duplicate_type=duplicate_type.value,
            similarity_score=similarity_score,
            detected_by=detected_by,
            details=details,
        )
        db.add(dup)
        await db.flush()
        return dup

    async def find_all_duplicates_of(self, item_id: str, db: AsyncSession | None = None) -> list[CorpusDuplicate]:
        """Find all duplicate relationships involving a given corpus item."""
        if db is None:
            return []

        query = select(CorpusDuplicate).where(
            (CorpusDuplicate.corpus_item_id_a == item_id) | (CorpusDuplicate.corpus_item_id_b == item_id)
        )
        result = await db.execute(query)
        return list(result.scalars().all())

    async def get_duplicate_groups(self, db: AsyncSession | None = None, limit: int = 100) -> list[dict[str, Any]]:
        """Get groups of duplicate items.

        Returns a list of groups, where each group is a set of item IDs
        connected by exact or near-duplicate relationships.
        """
        if db is None:
            return []

        result = await db.execute(
            select(CorpusDuplicate).where(CorpusDuplicate.duplicate_type == DuplicateType.EXACT.value).limit(limit)
        )
        duplicates = list(result.scalars().all())

        # Build adjacency list and find connected components
        adj: dict[str, set[str]] = {}
        for dup in duplicates:
            adj.setdefault(dup.corpus_item_id_a, set()).add(dup.corpus_item_id_b)
            adj.setdefault(dup.corpus_item_id_b, set()).add(dup.corpus_item_id_a)

        visited: set[str] = set()
        groups: list[dict[str, Any]] = []
        for node in adj:
            if node in visited:
                continue
            component: set[str] = set()
            stack = [node]
            while stack:
                current = stack.pop()
                if current in visited:
                    continue
                visited.add(current)
                component.add(current)
                for neighbor in adj.get(current, set()):
                    if neighbor not in visited:
                        stack.append(neighbor)
            if len(component) > 1:
                groups.append({"item_ids": sorted(component), "count": len(component), "type": "exact"})

        return groups
