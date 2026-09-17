from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ProcessingContext:
    """Shared context passed through pipeline stages."""

    media_asset_id: str
    user_id: str
    modality: str
    file_path: str
    file_size: int
    mime_type: str
    original_filename: str
    metadata: dict[str, Any] = field(default_factory=dict)
    features: dict[str, Any] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    source_sha256: str | None = None
    lineage: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ProcessingResult:
    """Result of a modality processor."""

    success: bool
    metadata: dict[str, Any] = field(default_factory=dict)
    features: dict[str, Any] = field(default_factory=dict)
    normalized_path: str | None = None
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class MediaProcessor(ABC):
    """Abstract base class for modality-specific media processors.

    Each processor exposes a consistent interface for the ingestion pipeline:
    1. validate   - check format/size/constraints
    2. extract_metadata - extract modality-specific metadata
    3. normalize  - normalize to canonical form
    4. preprocess - cleaning, transformation
    5. extract_features - compute features for downstream ML
    """

    modality: str = ""

    @abstractmethod
    async def validate(self, ctx: ProcessingContext) -> ProcessingResult:
        """Validate the file format and basic constraints."""

    @abstractmethod
    async def extract_metadata(self, ctx: ProcessingContext) -> ProcessingResult:
        """Extract modality-specific metadata (dimensions, duration, etc.)."""

    @abstractmethod
    async def normalize(self, ctx: ProcessingContext) -> ProcessingResult:
        """Normalize to canonical form (encoding, format, etc.)."""

    @abstractmethod
    async def preprocess(self, ctx: ProcessingContext) -> ProcessingResult:
        """Clean and transform the data for feature extraction."""

    @abstractmethod
    async def extract_features(self, ctx: ProcessingContext) -> ProcessingResult:
        """Extract features for downstream ML analysis."""

    async def parse_structure(self, ctx: ProcessingContext) -> ProcessingResult:
        """Parse modality structure into the normalized representation."""
        return ProcessingResult(success=True)

    async def assess_corpus_eligibility(self, ctx: ProcessingContext) -> ProcessingResult:
        """Determine whether the processed asset can enter the corpus."""
        eligible = bool(ctx.metadata.get("normalized_path") or ctx.features)
        ctx.metadata["corpus_eligible"] = eligible
        return ProcessingResult(success=eligible, metadata={"corpus_eligible": eligible})

    async def run_pipeline(self, ctx: ProcessingContext) -> ProcessingResult:
        """Execute the full processing pipeline. Override for custom flows."""
        steps = [
            ("validate", self.validate),
            ("extract_metadata", self.extract_metadata),
            ("normalize", self.normalize),
            ("preprocess", self.preprocess),
            ("parse_structure", self.parse_structure),
            ("extract_features", self.extract_features),
        ]
        combined = ProcessingResult(success=True)
        for _step_name, step_fn in steps:
            result = await step_fn(ctx)
            combined.metadata.update(result.metadata)
            combined.features.update(result.features)
            combined.warnings.extend(result.warnings)
            if not result.success:
                combined.success = False
                combined.errors.extend(result.errors)
                return combined
        return combined


# Registry of processors
_PROCESSORS: dict[str, type[MediaProcessor]] = {}
_BUILTINS_LOADED = False


def _load_builtin_processors() -> None:
    global _BUILTINS_LOADED
    if _BUILTINS_LOADED:
        return
    from app.services.media_processors import (  # noqa: F401
        audio_processor,
        document_processor,
        image_processor,
        text_processor,
        video_processor,
    )

    _BUILTINS_LOADED = True


def register_processor(modality: str, cls: type[MediaProcessor]) -> None:
    _PROCESSORS[modality] = cls


def get_processor(modality: str) -> MediaProcessor:
    _load_builtin_processors()
    cls = _PROCESSORS.get(modality)
    if cls is None:
        raise ValueError(f"No processor registered for modality '{modality}'")
    return cls()


def supported_modalities() -> list[str]:
    _load_builtin_processors()
    return list(_PROCESSORS.keys())
