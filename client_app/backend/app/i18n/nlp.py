"""
Multilingual NLP utilities.

Provides language-aware tokenization, word segmentation, and text processing
for the 6 supported languages. Falls back to whitespace-based tokenization
for languages without dedicated NLP models.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

# ---------------------------------------------------------------------------
# Unicode script ranges for tokenization
# ---------------------------------------------------------------------------

_SCRIPT_RANGES: dict[str, list[tuple[int, int]]] = {
    "Latin": [(0x0000, 0x024F)],
    "Devanagari": [(0x0900, 0x097F), (0x0A80, 0x0AFF)],
    "Telugu": [(0x0C00, 0x0C7F)],
    "Tamil": [(0x0B80, 0x0BFF)],
    "Kannada": [(0x0C80, 0x0CFF)],
    "Malayalam": [(0x0D00, 0x0D7F)],
    "Bengali": [(0x0980, 0x09FF)],
}

# Indic languages that use combining characters (matras) after consonants
_INDIC_COMBINING_RANGES: list[tuple[int, int]] = [
    (0x0300, 0x036F),  # Combining Diacritical Marks
    (0x0900, 0x097F),  # Devanagari combining marks
    (0x0B82, 0x0BCD),  # Tamil combining marks
    (0x0C00, 0x0C7F),  # Telugu combining marks
    (0x0C80, 0x0CFF),  # Kannada combining marks
    (0x0D00, 0x0D7F),  # Malayalam combining marks
]


def detect_script(text: str) -> str:
    """Detect the primary script of a text using Unicode character analysis."""
    if not text:
        return "Unknown"

    script_counts: dict[str, int] = {}
    sample = text[:2000]

    for char in sample:
        cp = ord(char)
        if cp < 128:
            script_counts["Latin"] = script_counts.get("Latin", 0) + 1
            continue
        for script_name, ranges in _SCRIPT_RANGES.items():
            for start, end in ranges:
                if start <= cp <= end:
                    script_counts[script_name] = script_counts.get(script_name, 0) + 1
                    break

    if not script_counts:
        return "Unknown"

    return max(script_counts, key=script_counts.get)  # type: ignore[arg-type]


def tokenize_whitespace(text: str) -> list[str]:
    """Basic whitespace + punctuation tokenization for Latin script."""
    return re.findall(r"\b[\w'-]+\b", text, flags=re.UNICODE)


def tokenize_indic(text: str) -> list[str]:
    """Tokenize Indic scripts (Devanagari, Telugu, Tamil, Kannada, Malayalam).

    These scripts do not use spaces between words. We use a combination of:
    1. Split on punctuation and whitespace
    2. Split on vowel signs (matras) as approximate word boundaries
    3. Split on the VIRAMA (halant) character sequences

    This is a heuristic approach. For production, use a dedicated
    word segmenter like IndicNLP or pkuseg.
    """
    if not text:
        return []

    # Normalize NFKC
    text = unicodedata.normalize("NFKC", text)

    # Split on whitespace, punctuation, and digits
    tokens = re.split(r"[\s\d\u0964\u0965\u093d]+", text)

    # Further split tokens that contain multiple words joined without spaces
    # by detecting vowel sign sequences (matras) as word boundaries
    expanded: list[str] = []
    for token in tokens:
        if not token:
            continue
        # Split on combining marks that follow consonants
        # This is approximate — a proper segmenter would be better
        sub_tokens = re.findall(
            r"[\u0900-\u097F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]+",
            token,
        )
        if sub_tokens:
            expanded.extend(sub_tokens)
        elif token.strip():
            expanded.append(token)

    return [t for t in expanded if len(t.strip()) > 0]


def tokenize(text: str, language: str = "en") -> list[str]:
    """Language-aware tokenization.

    For Latin-based scripts (English), uses word-boundary regex.
    For Indic scripts, uses heuristic word segmentation.
    """
    if not text or not text.strip():
        return []

    script = detect_script(text)

    if script in ("Latin", "Unknown"):
        return tokenize_whitespace(text)
    else:
        return tokenize_indic(text)


def segment_sentences(text: str, language: str = "en") -> list[str]:
    """Segment text into sentences.

    Handles both Western punctuation (periods, etc.) and Indic dandas.
    """
    if not text or not text.strip():
        return []

    # Indic sentence terminators: danda (।) and double danda (॥)
    # Western: . ! ?
    # Split on these followed by whitespace
    sentences = re.split(r"(?<=[.!?!\u0964\u0965])\s+", text)
    return [s.strip() for s in sentences if s.strip()]


def segment_paragraphs(text: str) -> list[str]:
    """Segment text into paragraphs."""
    if not text or not text.strip():
        return []
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


def count_words(text: str, language: str = "en") -> int:
    """Count words in text using language-appropriate tokenization."""
    return len(tokenize(text, language))


def get_text_statistics(text: str, language: str = "en") -> dict[str, Any]:
    """Get comprehensive text statistics including language-aware metrics."""
    tokens = tokenize(text, language)
    sentences = segment_sentences(text, language)
    paragraphs = segment_paragraphs(text)
    unique_tokens = set(t.lower() for t in tokens)

    return {
        "word_count": len(tokens),
        "token_count": len(tokens),
        "sentence_count": len(sentences),
        "paragraph_count": len(paragraphs),
        "character_count": len(text),
        "character_count_no_spaces": len(text.replace(" ", "").replace("\n", "")),
        "vocabulary_size": len(unique_tokens),
        "lexical_diversity": len(unique_tokens) / max(len(tokens), 1),
        "avg_word_length": sum(len(t) for t in tokens) / max(len(tokens), 1),
        "avg_sentence_length": sum(len(t.split()) for t in sentences) / max(len(sentences), 1),
        "script": detect_script(text),
        "language": language,
    }
