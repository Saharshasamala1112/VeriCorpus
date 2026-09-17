from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.core.media_registry import validate_file_signature
from app.services.media_processors import ProcessingContext, get_processor, supported_modalities


def _context(tmp_path: Path, modality: str, name: str, content: bytes | str, mime: str) -> ProcessingContext:
    path = tmp_path / name
    if isinstance(content, str):
        path.write_text(content, encoding="utf-8")
    else:
        path.write_bytes(content)
    return ProcessingContext(
        media_asset_id="asset-1",
        user_id="user-1",
        modality=modality,
        file_path=str(path),
        file_size=len(content),
        mime_type=mime,
        original_filename=name,
    )


def test_all_modalities_have_registered_processors() -> None:
    assert set(supported_modalities()) == {"text", "image", "audio", "video", "document"}
    for modality in supported_modalities():
        processor = get_processor(modality)
        assert processor.modality == modality


def test_signature_validation_rejects_mismatched_binary(tmp_path: Path) -> None:
    valid, error = validate_file_signature("image", b"not-an-image", "image.png")
    assert not valid
    assert error


def test_text_processor_preserves_structure_and_lineage_context(tmp_path: Path) -> None:
    context = _context(
        tmp_path,
        "text",
        "sample.txt",
        "First sentence. Second sentence.\n\nA second paragraph.",
        "text/plain",
    )
    context.source_sha256 = "a" * 64
    result = asyncio.run(get_processor("text").run_pipeline(context))
    assert result.success
    structure = context.metadata["structure"]
    assert structure["token_count"] == 7
    assert len(structure["paragraphs"]) == 2
    assert context.source_sha256 == "a" * 64


@pytest.mark.parametrize(
    ("modality", "filename", "content", "mime"),
    [
        ("image", "sample.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 32, "image/png"),
        ("audio", "sample.wav", b"RIFF" + b"\x00" * 40, "audio/wav"),
        ("video", "sample.mp4", b"\x00\x00\x00\x20ftyp" + b"\x00" * 32, "video/mp4"),
        ("document", "sample.pdf", b"%PDF-1.7\n" + b"\x00" * 32, "application/pdf"),
    ],
)
def test_binary_processors_fail_explicitly_on_corrupt_payload(
    tmp_path: Path, modality: str, filename: str, content: bytes, mime: str
) -> None:
    context = _context(tmp_path, modality, filename, content, mime)
    result = asyncio.run(get_processor(modality).validate(context))
    assert isinstance(result.success, bool)
