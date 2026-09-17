from __future__ import annotations

import hashlib
import os
import re
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

from app.core.config import settings


class StorageProvider(Protocol):
    async def upload(self, data: bytes, path: str, content_type: str | None = None) -> str: ...
    async def download(self, path: str) -> bytes: ...
    async def delete(self, path: str) -> bool: ...
    async def exists(self, path: str) -> bool: ...
    async def get_metadata(self, path: str) -> dict: ...


def _resolve_storage_path(base_dir: Path, path: str) -> Path:
    relative = path.replace("\\", "/").strip()
    if not relative or relative in {".", "/"}:
        raise ValueError("Storage path is unsafe")
    candidate = Path(relative)
    if candidate.is_absolute() or any(part in {"", ".", ".."} for part in candidate.parts):
        raise ValueError("Storage path is unsafe")
    resolved = (base_dir / candidate).resolve()
    try:
        resolved.relative_to(base_dir.resolve())
    except ValueError as exc:
        raise ValueError("Storage path is unsafe") from exc
    return resolved


class LocalStorage:
    def __init__(self, base_dir: str | None = None):
        self.base_dir = Path(base_dir or settings.UPLOAD_DIR).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def upload(self, data: bytes, path: str, content_type: str | None = None) -> str:
        full_path = _resolve_storage_path(self.base_dir, path)
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_bytes(data)
        return str(full_path)

    async def download(self, path: str) -> bytes:
        full_path = _resolve_storage_path(self.base_dir, path)
        if not full_path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        return full_path.read_bytes()

    async def delete(self, path: str) -> bool:
        full_path = _resolve_storage_path(self.base_dir, path)
        if full_path.exists():
            if full_path.is_dir():
                shutil.rmtree(full_path)
            else:
                full_path.unlink()
            return True
        return False

    async def exists(self, path: str) -> bool:
        try:
            return _resolve_storage_path(self.base_dir, path).exists()
        except ValueError:
            return False

    async def get_metadata(self, path: str) -> dict:
        full_path = _resolve_storage_path(self.base_dir, path)
        if not full_path.exists():
            return {}
        stat = full_path.stat()
        return {
            "path": str(full_path),
            "size": stat.st_size,
            "modified": stat.st_mtime,
        }


def sanitize_filename(filename: str) -> str:
    name = os.path.basename(filename or "")
    name = name.replace("..", "")
    name = name.replace("/", "").replace("\\", "")
    name = re.sub(r"[^A-Za-z0-9._ -]", "", name)
    name = name.strip() or "unnamed"
    return name[:255]


def sanitize_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    if not metadata:
        return {}
    cleaned: dict[str, Any] = {}
    for key, value in metadata.items():
        safe_key = re.sub(r"[^A-Za-z0-9_.-]", "", str(key))[:128]
        if not safe_key:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            cleaned[safe_key] = str(value)[:4096] if isinstance(value, str) else value
        elif isinstance(value, (list, tuple)):
            cleaned[safe_key] = [sanitize_metadata({"value": item})["value"] for item in value[:20]]
        else:
            cleaned[safe_key] = str(value)[:4096]
    return cleaned


def create_secure_temp_file(directory: str | Path, *, prefix: str = "secure_", suffix: str = ".tmp") -> Path:
    target_dir = Path(directory).expanduser().resolve()
    target_dir.mkdir(parents=True, exist_ok=True)
    fd, path = tempfile.mkstemp(prefix=prefix, suffix=suffix, dir=str(target_dir))
    os.close(fd)
    os.chmod(path, 0o600)
    return Path(path)


def compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def generate_storage_path(media_type: str, filename: str, user_id: str) -> str:
    now = datetime.now(UTC)
    clean_media_type = re.sub(r"[^A-Za-z0-9_-]", "", (media_type or "media").strip())[:32]
    clean_user_id = re.sub(r"[^A-Za-z0-9_-]", "", (user_id or "unknown").strip())[:64]
    ext = Path(sanitize_filename(filename)).suffix.lower()
    digest = hashlib.sha256(f"{clean_media_type}:{clean_user_id}:{filename}:{now.isoformat()}".encode()).hexdigest()[
        :12
    ]
    return f"{clean_media_type}/{now.year}/{now.month:02d}/{now.day:02d}/{clean_user_id}/{digest}{ext}"
