from app.core.media_registry import detect_modality, get_capability, supported_modalities


def test_registry_exposes_all_supported_modalities():
    assert set(supported_modalities()) == {"text", "document", "image", "audio", "video"}


def test_registry_detects_by_mime_and_extension():
    assert detect_modality("report.pdf", "application/pdf") == "document"
    assert detect_modality("voice.m4a", "application/octet-stream") == "audio"
    assert detect_modality("photo.png", None) == "image"


def test_registry_validates_format_and_size_capability():
    capability = get_capability("video")
    assert capability.accepts("clip.mp4", "video/mp4")
    assert not capability.accepts("clip.exe", "application/octet-stream")
