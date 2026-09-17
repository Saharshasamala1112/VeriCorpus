"""Central media format and capability registry.

The registry is the backend source of truth for upload validation, modality
inference, size limits, and processor capability discovery.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class FormatCapability:
    modality: str
    extensions: frozenset[str]
    mime_types: frozenset[str]
    max_size_bytes: int
    textual: bool = False
    signatures: tuple[bytes, ...] = ()

    def accepts(self, filename: str, mime_type: str | None = None) -> bool:
        extension = Path(filename).suffix.lower()
        return extension in self.extensions or (mime_type is not None and mime_type in self.mime_types)


_MB = 1024 * 1024

CAPABILITIES: tuple[FormatCapability, ...] = (
    FormatCapability(
        "text",
        frozenset({".txt", ".md", ".csv", ".json", ".jsonl", ".xml", ".html"}),
        frozenset({"text/plain", "text/markdown", "text/csv", "application/json", "application/ld+json", "text/html"}),
        10 * _MB,
        textual=True,
    ),
    FormatCapability(
        "document",
        frozenset({".pdf", ".docx"}),
        frozenset(
            {
                "application/pdf",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            }
        ),
        50 * _MB,
        textual=True,
        signatures=(b"%PDF-", b"PK\x03\x04"),
    ),
    FormatCapability(
        "image",
        frozenset({".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff"}),
        frozenset({"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff"}),
        100 * _MB,
        signatures=(b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"RIFF"),
    ),
    FormatCapability(
        "audio",
        frozenset({".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".wma"}),
        frozenset({"audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/mp4", "audio/aac"}),
        200 * _MB,
        signatures=(b"ID3", b"RIFF", b"OggS", b"fLaC", b"\xff\xfb"),
    ),
    FormatCapability(
        "video",
        frozenset({".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv", ".wmv"}),
        frozenset({"video/mp4", "video/x-msvideo", "video/quicktime", "video/x-matroska", "video/webm"}),
        2 * 1024 * _MB,
        signatures=(b"RIFF", b"\x1a\x45\xdf\xa3", b"ftyp"),
    ),
)

CAPABILITIES_BY_MODALITY = {capability.modality: capability for capability in CAPABILITIES}
CAPABILITIES_BY_EXTENSION = {
    extension: capability for capability in CAPABILITIES for extension in capability.extensions
}
CAPABILITIES_BY_MIME = {mime_type: capability for capability in CAPABILITIES for mime_type in capability.mime_types}


def get_capability(modality: str) -> FormatCapability:
    try:
        return CAPABILITIES_BY_MODALITY[modality]
    except KeyError as exc:
        raise ValueError(f"Unsupported modality: {modality}") from exc


def detect_modality(filename: str, mime_type: str | None = None) -> str | None:
    if mime_type and mime_type in CAPABILITIES_BY_MIME:
        return CAPABILITIES_BY_MIME[mime_type].modality
    capability = CAPABILITIES_BY_EXTENSION.get(Path(filename).suffix.lower())
    return capability.modality if capability else None


def supported_modalities() -> tuple[str, ...]:
    return tuple(CAPABILITIES_BY_MODALITY)


def validate_file_signature(modality: str, data: bytes, filename: str) -> tuple[bool, str | None]:
    """Validate magic bytes without trusting a client-provided MIME type.

    Text formats intentionally allow printable content without a fixed signature.
    Container formats such as DOCX are validated by their ZIP signature and by the
    modality capability selected from the filename/MIME registry.
    """
    capability = get_capability(modality)
    if capability.textual and modality == "text":
        if b"\x00" in data[:8192]:
            return False, "Text input contains binary NUL bytes"
        return True, None
    if not any(data.startswith(signature) or signature in data[:32] for signature in capability.signatures):
        return False, f"File signature does not match the {modality} capability"
    return True, None
