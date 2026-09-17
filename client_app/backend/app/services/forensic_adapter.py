from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.storage import create_secure_temp_file


class ForensicAdapter:
    """Bridge the forensic detection pipelines into the app's result contract."""

    def __init__(self) -> None:
        self.root = Path(settings.FORENSIC_MODEL_ROOT).expanduser() if settings.FORENSIC_MODEL_ROOT else None
        self._runner = None
        self._explainer = None
        self._load_error: str | None = None

    @property
    def configured(self) -> bool:
        return bool(settings.FORENSIC_ENABLED and self.root and self.root.exists())

    @property
    def ready(self) -> bool:
        if not self.configured or self.root is None:
            return False
        self._load_runtime()
        if settings.FORENSIC_MODEL_PATH:
            model_available = Path(settings.FORENSIC_MODEL_PATH).expanduser().exists()
        else:
            model_available = any(
                candidate.exists()
                for candidate in (
                    self.root / "models" / "best_model.pth",
                    self.root / "best_model.pth",
                    self.root / "training" / "model.pth",
                )
            )
        return self._runner is not None and model_available

    def _load_runtime(self) -> None:
        if self._runner is not None or self._load_error or not self.configured:
            return
        try:
            root = str(self.root)
            if root not in sys.path:
                sys.path.insert(0, root)
            self._runner = importlib.import_module("system.inference").run_inference
            self._explainer = importlib.import_module("system.explain").explain
        except Exception as error:
            self._load_error = str(error)

    def status(self) -> dict[str, Any]:
        return {
            "configured": self.configured,
            "ready": self.ready,
            "model_path": settings.FORENSIC_MODEL_PATH or "default model locations",
            "error": self._load_error,
        }

    async def analyze(self, data: bytes, filename: str, media_type: str) -> dict[str, Any] | None:
        if media_type not in {"image", "video", "audio", "document"} or not self.ready or self._runner is None:
            return None

        suffix = Path(filename).suffix or ".bin"
        output_dir = Path(settings.FORENSIC_OUTPUT_DIR)
        output_dir.mkdir(parents=True, exist_ok=True)
        source_path = create_secure_temp_file(output_dir, prefix="forensic_", suffix=suffix)
        source_path.write_bytes(data)

        try:
            model_path = settings.FORENSIC_MODEL_PATH or None
            try:
                result = await asyncio.to_thread(
                    self._runner,
                    str(source_path),
                    media_type,
                    True,
                    300,
                )
            except Exception as error:
                return {"type": media_type, "error": str(error)}
            if model_path and isinstance(result, dict):
                result.setdefault("model_path", model_path)
            if isinstance(result, dict) and self._explainer:
                try:
                    result["technical_explanation"] = self._explainer(result)
                except Exception:
                    result["technical_explanation"] = ""
            return result
        finally:
            source_path.unlink(missing_ok=True)


forensic_adapter = ForensicAdapter()
