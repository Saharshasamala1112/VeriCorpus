import os
import tempfile
from pathlib import Path

import pytest

from app.storage import LocalStorage, compute_sha256, generate_storage_path, sanitize_filename


class TestLocalStorage:
    @pytest.fixture
    def storage(self, tmp_path):
        return LocalStorage(base_dir=str(tmp_path))

    @pytest.mark.anyio
    async def test_upload_and_download(self, storage):
        data = b"hello world"
        await storage.upload(data, "test/file.txt")
        downloaded = await storage.download("test/file.txt")
        assert downloaded == data

    @pytest.mark.anyio
    async def test_exists(self, storage):
        assert await storage.exists("nonexistent.txt") is False
        await storage.upload(b"data", "existing.txt")
        assert await storage.exists("existing.txt") is True

    @pytest.mark.anyio
    async def test_delete(self, storage):
        await storage.upload(b"data", "to_delete.txt")
        assert await storage.exists("to_delete.txt") is True
        result = await storage.delete("to_delete.txt")
        assert result is True
        assert await storage.exists("to_delete.txt") is False

    @pytest.mark.anyio
    async def test_delete_nonexistent(self, storage):
        result = await storage.delete("nonexistent.txt")
        assert result is False

    @pytest.mark.anyio
    async def test_get_metadata(self, storage):
        await storage.upload(b"hello", "meta.txt")
        meta = await storage.get_metadata("meta.txt")
        assert meta["size"] == 5
        assert "path" in meta

    @pytest.mark.anyio
    async def test_rejects_path_traversal(self, storage):
        with pytest.raises(ValueError, match="unsafe"):
            await storage.upload(b"data", "../outside.txt")

    @pytest.mark.anyio
    async def test_rejects_absolute_paths(self, storage):
        absolute_path = str(Path("/") / "tmp" / "evil.txt")
        with pytest.raises(ValueError, match="unsafe"):
            await storage.upload(b"data", absolute_path)

    @pytest.mark.anyio
    async def test_download_nonexistent(self, storage):
        with pytest.raises(FileNotFoundError):
            await storage.download("nonexistent.txt")


class TestSanitizeFilename:
    def test_normal_filename(self):
        assert sanitize_filename("document.pdf") == "document.pdf"

    def test_path_traversal(self):
        result = sanitize_filename("../../../etc/passwd")
        assert ".." not in result
        assert "/" not in result

    def test_empty_name(self):
        result = sanitize_filename("")
        assert result == "unnamed"

    def test_special_characters(self):
        result = sanitize_filename("file name with spaces.txt")
        assert result == "file name with spaces.txt"


class TestHelpers:
    def test_compute_sha256(self):
        hash1 = compute_sha256(b"hello")
        hash2 = compute_sha256(b"hello")
        assert hash1 == hash2
        assert len(hash1) == 64

    def test_compute_sha256_different_data(self):
        hash1 = compute_sha256(b"hello")
        hash2 = compute_sha256(b"world")
        assert hash1 != hash2

    def test_generate_storage_path(self):
        path = generate_storage_path("text", "doc.pdf", "user-123")
        assert path.startswith("text/")
        assert "user-123" in path
        assert path.endswith(".pdf")
