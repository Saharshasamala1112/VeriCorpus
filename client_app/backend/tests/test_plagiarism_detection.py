from datetime import UTC

import pytest

from app.services.plagiarism_detection import (
    InMemorySourceRetriever,
    MatchType,
    MultiStagePlagiarismDetector,
    SimilaritySource,
    TextSegment,
    lexical_similarity,
    ngram_similarity,
    segment_text,
)


def source(text: str, source_id: str = "source-1") -> SimilaritySource:
    return SimilaritySource(source_id, text, "Reference", "https://example.test/reference")


@pytest.mark.asyncio
async def test_exact_copy_records_offsets_and_source_timestamp():
    text = "This sentence is copied exactly from the reference."
    matches = await MultiStagePlagiarismDetector(
        source_retriever=InMemorySourceRetriever([source(text)]),
        minimum_segment_words=3,
    ).detect(text)
    assert matches
    match = matches[0]
    assert match.match_type == MatchType.EXACT
    assert match.confirmed_plagiarism is True
    assert match.input_span.start_offset == 0
    assert match.source_span.end_offset == len(text)
    assert match.source_url == "https://example.test/reference"
    assert match.retrieved_at.tzinfo == UTC


@pytest.mark.asyncio
async def test_minor_edits_are_near_duplicate_or_lexical():
    original = "The committee approved the proposal after reviewing the evidence."
    edited = "The committee approved this proposal after reviewing the evidence."
    matches = await MultiStagePlagiarismDetector(
        source_retriever=InMemorySourceRetriever([source(original)]),
        minimum_segment_words=3,
    ).detect(edited)
    assert matches
    assert matches[0].match_type in {MatchType.NEAR_DUPLICATE, MatchType.LEXICAL, MatchType.NGRAM}


@pytest.mark.asyncio
async def test_paraphrase_requires_semantic_and_lexical_support():
    class Semantic:
        async def similarity(self, left, right, *, language="en"):
            return 0.9

    matches = await MultiStagePlagiarismDetector(
        source_retriever=InMemorySourceRetriever([source("The team completed the evaluation of the system.")]),
        semantic_provider=Semantic(),
        minimum_segment_words=3,
    ).detect("The team finished the evaluation of the system.")
    assert matches
    assert matches[0].match_type in {MatchType.PARAPHRASE, MatchType.NEAR_DUPLICATE, MatchType.LEXICAL}


@pytest.mark.asyncio
async def test_semantic_similarity_alone_is_not_confirmed_plagiarism():
    class Semantic:
        async def similarity(self, left, right, *, language="en"):
            return 0.95

    matches = await MultiStagePlagiarismDetector(
        source_retriever=InMemorySourceRetriever([source("A completely unrelated topic about astronomy.")]),
        semantic_provider=Semantic(),
        minimum_segment_words=3,
    ).detect("A discussion of cooking recipes and kitchen equipment.")
    assert matches
    assert matches[0].match_type == MatchType.SEMANTIC
    assert matches[0].confirmed_plagiarism is False


def test_unrelated_and_common_phrase_similarity_stays_limited():
    assert lexical_similarity("the quick brown fox", "quantum mechanics experiments") == 0.0
    assert ngram_similarity("in conclusion the results", "in conclusion the findings") < 1.0


def test_segmentation_preserves_sentence_offsets():
    text = "First sentence here.\n\nSecond sentence is longer."
    segments = segment_text(text, minimum_words=2)
    assert len(segments) == 2
    assert text[segments[0].start_offset : segments[0].end_offset] == "First sentence here."
    assert text[segments[1].start_offset : segments[1].end_offset] == "Second sentence is longer."
