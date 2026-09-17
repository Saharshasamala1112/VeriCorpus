from __future__ import annotations

import html
import re
import unicodedata
from pathlib import Path

from app.services.media_processors import (
    MediaProcessor,
    ProcessingContext,
    ProcessingResult,
    register_processor,
)

# Encoding detection heuristic order
_COMMON_ENCODINGS = ["utf-8", "utf-8-sig", "utf-16", "utf-16-le", "utf-16-be", "latin-1", "cp1252", "ascii"]


def _detect_encoding(data: bytes) -> str:
    """Heuristic encoding detection. Checks BOM first, then tries common encodings."""
    if data[:3] == b"\xef\xbb\xbf":
        return "utf-8-sig"
    if data[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return "utf-16"
    if data[:4] in (b"\xff\xfe\x00\x00", b"\x00\x00\xfe\xff"):
        return "utf-32"
    for enc in _COMMON_ENCODINGS:
        try:
            data.decode(enc)
            return enc
        except (UnicodeDecodeError, LookupError):
            continue
    return "utf-8"


def _normalize_unicode(text: str) -> str:
    """NFKC normalize and strip control characters."""
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return text


def _detect_language_heuristic(text: str) -> str:
    """Heuristic language detection based on Unicode character ranges.

    Detects: English, Hindi, Telugu, Tamil, Kannada, Malayalam, Bengali, Gujarati.
    Returns 'unknown' if no dominant script is found.
    """
    sample = text[:5000]
    if not sample:
        return "unknown"

    # Count characters by script
    script_counts: dict[str, int] = {}
    for char in sample:
        cp = ord(char)
        if cp < 128:
            script_counts["en"] = script_counts.get("en", 0) + 1
        elif 0x0900 <= cp <= 0x097F:
            script_counts["hi"] = script_counts.get("hi", 0) + 1
        elif 0x0C00 <= cp <= 0x0C7F:
            script_counts["te"] = script_counts.get("te", 0) + 1
        elif 0x0B80 <= cp <= 0x0BFF:
            script_counts["ta"] = script_counts.get("ta", 0) + 1
        elif 0x0C80 <= cp <= 0x0CFF:
            script_counts["kn"] = script_counts.get("kn", 0) + 1
        elif 0x0D00 <= cp <= 0x0D7F:
            script_counts["ml"] = script_counts.get("ml", 0) + 1
        elif 0x0980 <= cp <= 0x09FF:
            script_counts["bn"] = script_counts.get("bn", 0) + 1
        elif 0x0A80 <= cp <= 0x0AFF:
            script_counts["gu"] = script_counts.get("gu", 0) + 1

    if not script_counts:
        return "unknown"

    # Find dominant script
    dominant = max(script_counts, key=script_counts.get)  # type: ignore[arg-type]
    total = sum(script_counts.values())

    # Require at least 20% of characters to be in the dominant script
    if script_counts.get(dominant, 0) / max(total, 1) < 0.2:
        return "unknown"

    return dominant


def _count_structure(text: str) -> dict[str, int]:
    """Count structural elements in text."""
    lines = text.split("\n")
    paragraphs = [p for p in re.split(r"\n\s*\n", text) if p.strip()]
    sentences = re.findall(r"[.!?]+\s", text)
    words = text.split()
    return {
        "lines": len(lines),
        "paragraphs": len(paragraphs),
        "sentences": len(sentences),
        "words": len(words),
        "characters": len(text),
        "characters_no_spaces": len(text.replace(" ", "").replace("\n", "")),
    }


class TextProcessor(MediaProcessor):
    modality = "text"

    async def validate(self, ctx: ProcessingContext) -> ProcessingResult:
        path = Path(ctx.file_path)
        if not path.exists():
            return ProcessingResult(success=False, errors=["File not found"])

        max_size = 10 * 1024 * 1024  # 10MB for text
        if ctx.file_size > max_size:
            return ProcessingResult(
                success=False,
                errors=[f"Text file too large: {ctx.file_size} bytes (max {max_size})"],
            )

        if ctx.file_size == 0:
            return ProcessingResult(success=False, errors=["Empty file"])

        supported_ext = {".txt", ".md", ".csv", ".json", ".jsonl", ".xml", ".html", ".rtf"}
        ext = path.suffix.lower()
        if ext and ext not in supported_ext:
            return ProcessingResult(
                success=False,
                errors=[f"Unsupported text format: {ext}"],
            )
        return ProcessingResult(success=True)

    async def extract_metadata(self, ctx: ProcessingContext) -> ProcessingResult:
        try:
            raw = Path(ctx.file_path).read_bytes()
        except Exception as e:
            return ProcessingResult(success=False, errors=[f"Failed to read file: {e}"])

        encoding = _detect_encoding(raw)
        try:
            text = raw.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            text = raw.decode("utf-8", errors="replace")
            ctx.warnings.append(f"Decoding with fallback (detected: {encoding})")

        structure = _count_structure(text)
        language = _detect_language_heuristic(text)

        metadata = {
            "encoding": encoding,
            "language": language,
            "is_structured": _is_structured(text),
            "structure": structure,
            "text_preview": text[:500],
            "text_length": len(text),
            "line_count": structure["lines"],
            "word_count": structure["words"],
        }
        ctx.metadata.update(metadata)
        return ProcessingResult(success=True, metadata=metadata)

    async def normalize(self, ctx: ProcessingContext) -> ProcessingResult:
        try:
            raw = Path(ctx.file_path).read_bytes()
        except Exception as e:
            return ProcessingResult(success=False, errors=[f"Failed to read file: {e}"])

        encoding = ctx.metadata.get("encoding", "utf-8")
        try:
            text = raw.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            text = raw.decode("utf-8", errors="replace")

        text = _normalize_unicode(text)
        text = html.unescape(text)
        text = re.sub(r"\r\n", "\n", text)
        text = re.sub(r"\r", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = text.strip()

        normalized_path = ctx.file_path + ".normalized.txt"
        Path(normalized_path).write_text(text, encoding="utf-8")
        ctx.metadata["normalized_path"] = normalized_path
        return ProcessingResult(success=True, normalized_path=normalized_path)

    async def preprocess(self, ctx: ProcessingContext) -> ProcessingResult:
        normalized_path = ctx.metadata.get("normalized_path", ctx.file_path)
        try:
            text = Path(normalized_path).read_text(encoding="utf-8")
        except Exception as e:
            return ProcessingResult(success=False, errors=[f"Failed to read normalized file: {e}"])

        # Remove boilerplate patterns
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)

        preprocessed_path = ctx.file_path + ".preprocessed.txt"
        Path(preprocessed_path).write_text(text, encoding="utf-8")
        ctx.metadata["preprocessed_path"] = preprocessed_path
        ctx.metadata["preprocessed_length"] = len(text)
        return ProcessingResult(success=True, normalized_path=preprocessed_path)

    async def extract_features(self, ctx: ProcessingContext) -> ProcessingResult:
        preprocessed_path = ctx.metadata.get("preprocessed_path", ctx.file_path)
        try:
            text = Path(preprocessed_path).read_text(encoding="utf-8")
        except Exception as e:
            return ProcessingResult(success=False, errors=[f"Failed to read preprocessed file: {e}"])

        words = text.split()
        sentences = re.split(r"[.!?]+", text)
        sentences = [s.strip() for s in sentences if s.strip()]
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]

        avg_word_len = sum(len(w) for w in words) / max(len(words), 1)
        avg_sentence_len = sum(len(s.split()) for s in sentences) / max(len(sentences), 1)
        unique_words = set(w.lower() for w in words)
        lexical_diversity = len(unique_words) / max(len(words), 1)

        features = {
            "word_count": len(words),
            "sentence_count": len(sentences),
            "paragraph_count": len(paragraphs),
            "avg_word_length": round(avg_word_len, 2),
            "avg_sentence_length": round(avg_sentence_len, 2),
            "lexical_diversity": round(lexical_diversity, 4),
            "vocabulary_size": len(unique_words),
            "text_hash": _text_hash(text),
        }
        ctx.features.update(features)
        return ProcessingResult(success=True, features=features)

    async def parse_structure(self, ctx: ProcessingContext) -> ProcessingResult:
        path = ctx.metadata.get("preprocessed_path", ctx.file_path)
        text = Path(path).read_text(encoding="utf-8", errors="replace")
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        tokens = re.findall(r"\b[\w'-]+\b", text, flags=re.UNICODE)
        structure = {
            "paragraphs": paragraphs,
            "sentences": sentences,
            "token_count": len(tokens),
            "tokens": tokens[:10000],
        }
        ctx.metadata["structure"] = structure
        return ProcessingResult(success=True, metadata={"structure": structure})


def _is_structured(text: str) -> bool:
    json_braces = text.count("{") + text.count("}")
    csv_like = text.count(",") > len(text.split("\n")) * 0.5
    xml_like = text.count("<") > 5 and text.count(">") > 5
    return json_braces > 10 or csv_like or xml_like


def _text_hash(text: str) -> str:
    import hashlib

    return hashlib.sha256(text.encode("utf-8")).hexdigest()


register_processor("text", TextProcessor)
