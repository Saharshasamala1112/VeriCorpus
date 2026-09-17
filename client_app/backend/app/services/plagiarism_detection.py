"""Multi-stage plagiarism and similarity detection.

Similarity is reported by evidence type.  Semantic similarity alone is never
promoted to confirmed plagiarism; only overlapping lexical/hash evidence can
support a plagiarism classification.
"""

from __future__ import annotations

import abc
import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.intelligence import SimilarityMatch as SimilarityMatchModel


class MatchType:
    EXACT = "exact"
    NEAR_DUPLICATE = "near_duplicate"
    NGRAM = "ngram"
    LEXICAL = "lexical"
    PARAPHRASE = "paraphrase"
    SEMANTIC = "semantic"


@dataclass(frozen=True)
class TextSegment:
    text: str
    start_offset: int
    end_offset: int
    page: int | None = None
    paragraph: int | None = None
    sentence: int | None = None


@dataclass(frozen=True)
class SimilaritySource:
    source_id: str
    text: str
    title: str
    url: str | None = None
    source_type: str = "corpus"
    page: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SimilarityMatch:
    source_id: str
    source: str
    matched_text: str
    input_span: TextSegment
    source_span: TextSegment
    match_type: str
    similarity_score: float
    confidence: float
    location: dict[str, Any]
    retrieved_at: datetime
    source_url: str | None = None
    confirmed_plagiarism: bool = False


class SourceRetriever(abc.ABC):
    @abc.abstractmethod
    async def retrieve(self, query: str, *, top_k: int = 20) -> list[SimilaritySource]:
        raise NotImplementedError


class InMemorySourceRetriever(SourceRetriever):
    def __init__(self, sources: list[SimilaritySource]) -> None:
        self.sources = sources

    async def retrieve(self, query: str, *, top_k: int = 20) -> list[SimilaritySource]:
        query_tokens = set(_tokens(query))
        ranked = sorted(
            self.sources,
            key=lambda source: len(query_tokens & set(_tokens(source.text))),
            reverse=True,
        )
        return ranked[:top_k]


class SemanticSimilarityProvider(abc.ABC):
    @abc.abstractmethod
    async def similarity(self, left: str, right: str, *, language: str = "en") -> float:
        raise NotImplementedError


class MultiStagePlagiarismDetector:
    def __init__(
        self,
        *,
        source_retriever: SourceRetriever | None = None,
        semantic_provider: SemanticSimilarityProvider | None = None,
        retrieved_at: datetime | None = None,
        minimum_segment_words: int = 5,
    ) -> None:
        self.source_retriever = source_retriever or InMemorySourceRetriever([])
        self.semantic_provider = semantic_provider
        self.retrieved_at = retrieved_at or datetime.now(UTC)
        self.minimum_segment_words = minimum_segment_words

    async def detect(self, text: str, *, language: str = "en", top_k: int = 20) -> list[SimilarityMatch]:
        input_segments = segment_text(text, minimum_words=self.minimum_segment_words)
        matches: list[SimilarityMatch] = []
        for input_segment in input_segments:
            candidates = await self.source_retriever.retrieve(input_segment.text, top_k=top_k)
            for source in candidates:
                matches.extend(await self._compare_segment(input_segment, source, language=language))
        return aggregate_matches(matches)

    async def _compare_segment(
        self,
        input_segment: TextSegment,
        source: SimilaritySource,
        *,
        language: str,
    ) -> list[SimilarityMatch]:
        source_segments = segment_text(source.text, minimum_words=1)
        source_hash = _normalized_hash(input_segment.text)
        found: list[SimilarityMatch] = []
        for source_segment in source_segments:
            target_hash = _normalized_hash(source_segment.text)
            exact = source_hash == target_hash
            lexical = lexical_similarity(input_segment.text, source_segment.text)
            ngram = ngram_similarity(input_segment.text, source_segment.text)
            sequence = SequenceMatcher(None, _tokens(input_segment.text), _tokens(source_segment.text)).ratio()
            semantic = (
                await self.semantic_provider.similarity(input_segment.text, source_segment.text, language=language)
                if self.semantic_provider
                else 0.0
            )
            if exact:
                match_type, score, confidence = MatchType.EXACT, 1.0, 1.0
            elif ngram >= 0.82:
                match_type, score, confidence = MatchType.NGRAM, ngram, min(1.0, ngram)
            elif lexical >= 0.75 and sequence >= 0.72:
                match_type, score, confidence = MatchType.NEAR_DUPLICATE, max(lexical, sequence), 0.9
            elif lexical >= 0.55 and sequence >= 0.45:
                match_type, score, confidence = MatchType.LEXICAL, (lexical + sequence) / 2, 0.75
            elif semantic >= 0.78 and lexical >= 0.25:
                match_type, score, confidence = MatchType.PARAPHRASE, semantic, 0.65
            elif semantic >= 0.82:
                match_type, score, confidence = MatchType.SEMANTIC, semantic, 0.45
            else:
                continue
            found.append(
                SimilarityMatch(
                    source_id=source.source_id,
                    source=source.title,
                    matched_text=source_segment.text,
                    input_span=input_segment,
                    source_span=source_segment,
                    match_type=match_type,
                    similarity_score=score,
                    confidence=confidence,
                    location={
                        "input": _location(input_segment),
                        "source": _location(source_segment),
                        "source_type": source.source_type,
                    },
                    retrieved_at=self.retrieved_at,
                    source_url=source.url,
                    confirmed_plagiarism=match_type in {MatchType.EXACT, MatchType.NGRAM, MatchType.NEAR_DUPLICATE},
                )
            )
        return found


def segment_text(text: str, *, minimum_words: int = 1) -> list[TextSegment]:
    segments: list[TextSegment] = []
    paragraph_offset = 0
    paragraph_index = 0
    sentence_index = 0
    for paragraph in re.finditer(r"\S(?:.*?\S)?(?=\n\s*\n|\Z)", text, re.DOTALL):
        paragraph_text = paragraph.group(0)
        for sentence in re.finditer(r"[^.!?]+[.!?]?", paragraph_text):
            sentence_text = sentence.group(0).strip()
            if len(_tokens(sentence_text)) < minimum_words:
                continue
            relative_start = paragraph_text.find(sentence_text, sentence.start())
            start = paragraph.start() + max(relative_start, 0)
            end = start + len(sentence_text)
            segments.append(
                TextSegment(
                    sentence_text,
                    start,
                    end,
                    paragraph=paragraph_index,
                    sentence=sentence_index,
                )
            )
            sentence_index += 1
        paragraph_index += 1
        paragraph_offset += len(paragraph_text)
    return segments


def lexical_similarity(left: str, right: str) -> float:
    left_tokens = set(_tokens(left))
    right_tokens = set(_tokens(right))
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def ngram_similarity(left: str, right: str, *, n: int = 3) -> float:
    left_ngrams = _ngrams(_tokens(left), n)
    right_ngrams = _ngrams(_tokens(right), n)
    if not left_ngrams or not right_ngrams:
        return 0.0
    return len(left_ngrams & right_ngrams) / len(left_ngrams | right_ngrams)


def aggregate_matches(matches: list[SimilarityMatch]) -> list[SimilarityMatch]:
    best: dict[tuple[str, int, int], SimilarityMatch] = {}
    priority = {
        MatchType.EXACT: 6,
        MatchType.NGRAM: 5,
        MatchType.NEAR_DUPLICATE: 4,
        MatchType.LEXICAL: 3,
        MatchType.PARAPHRASE: 2,
        MatchType.SEMANTIC: 1,
    }
    for match in matches:
        key = (match.source_id, match.input_span.start_offset, match.input_span.end_offset)
        current = best.get(key)
        if current is None or (priority[match.match_type], match.similarity_score) > (
            priority[current.match_type],
            current.similarity_score,
        ):
            best[key] = match
    return sorted(best.values(), key=lambda match: (match.input_span.start_offset, -match.similarity_score))


async def persist_matches(
    db: AsyncSession,
    *,
    analysis_job_id: str,
    matches: list[SimilarityMatch],
    matched_asset_id: str | None = None,
    source_id_by_match: dict[str, str] | None = None,
) -> list[SimilarityMatch]:
    """Persist structured match lineage without collapsing match classifications."""
    for match in matches:
        db.add(
            SimilarityMatchModel(
                analysis_job_id=analysis_job_id,
                matched_asset_id=matched_asset_id,
                source_id=(source_id_by_match or {}).get(match.source_id, match.source_id),
                matched_text=match.matched_text,
                similarity_score=match.similarity_score,
                confidence=match.confidence,
                match_type=match.match_type,
                input_span_json=json.dumps(_location(match.input_span)),
                source_span_json=json.dumps(_location(match.source_span)),
                matched_span_json=json.dumps({"input": match.input_span.text, "source": match.source_span.text}),
                location_json=json.dumps(match.location, sort_keys=True),
                retrieved_at=match.retrieved_at,
            )
        )
    await db.flush()
    return matches


def _tokens(text: str) -> list[str]:
    return re.findall(r"\b[\w'-]+\b", text.casefold(), flags=re.UNICODE)


def _ngrams(tokens: list[str], n: int) -> set[str]:
    return {" ".join(tokens[index : index + n]) for index in range(len(tokens) - n + 1)}


def _normalized_hash(text: str) -> str:
    normalized = " ".join(_tokens(text))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _location(segment: TextSegment) -> dict[str, Any]:
    return {
        "page": segment.page,
        "paragraph": segment.paragraph,
        "sentence": segment.sentence,
        "start_offset": segment.start_offset,
        "end_offset": segment.end_offset,
    }
