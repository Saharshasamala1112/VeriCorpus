"""Model abstraction layer.

Provides ``ModelProvider`` and ``InferenceProvider`` interfaces so the
application can swap underlying models without touching the orchestration
layer.

Each concrete adapter implements the relevant protocol for its framework
(PyTorch, scikit-learn, ONNX, etc.) while the registry maps model IDs to
live provider instances.
"""

from __future__ import annotations

import abc
import json
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analysis import ModelFramework, ModelProviderStatus, ModelRegistry

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Value objects
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ModelMetadata:
    model_id: str
    display_name: str
    version: str
    modality: str
    task: str
    framework: ModelFramework
    status: ModelProviderStatus
    dataset_version: str | None = None
    storage_path: str | None = None
    accuracy: float | None = None
    f1_score: float | None = None
    precision_score: float | None = None
    recall_score: float | None = None
    promoted_at: datetime | None = None
    retired_at: datetime | None = None
    metrics: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class InferenceInput:
    data: Any
    modality: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class InferenceOutput:
    predictions: dict[str, Any]
    scores: dict[str, float]
    model_id: str
    model_version: str
    latency_ms: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Provider interfaces
# ---------------------------------------------------------------------------


class ModelProvider(abc.ABC):
    """Loads and manages a specific model."""

    @abc.abstractmethod
    def load(self, metadata: ModelMetadata) -> None:
        """Load model weights / artefacts from *metadata.storage_path*."""

    @abc.abstractmethod
    def unload(self) -> None:
        """Release resources held by this model."""

    @abc.abstractmethod
    def is_loaded(self) -> bool:
        """Return *True* if the model is ready for inference."""

    @abc.abstractmethod
    def get_metadata(self) -> ModelMetadata | None:
        """Return the metadata of the currently loaded model."""


class InferenceProvider(abc.ABC):
    """Runs inference on loaded models."""

    @abc.abstractmethod
    def predict(self, inp: InferenceInput) -> InferenceOutput:
        """Run a single prediction."""

    @abc.abstractmethod
    def predict_batch(self, inputs: list[InferenceInput]) -> list[InferenceOutput]:
        """Run batch prediction (default: sequential fallback)."""

    @property
    @abc.abstractmethod
    def supported_modalities(self) -> list[str]:
        """Modalities this provider can handle."""


# ---------------------------------------------------------------------------
# Mock / local adapters (development only)
# ---------------------------------------------------------------------------


class MockModelProvider(ModelProvider):
    """In-memory model provider for unit tests and development."""

    def __init__(self) -> None:
        self._loaded = False
        self._metadata: ModelMetadata | None = None

    def load(self, metadata: ModelMetadata) -> None:
        self._metadata = metadata
        self._loaded = True
        logger.info("MockModelProvider loaded %s v%s", metadata.model_id, metadata.version)

    def unload(self) -> None:
        self._loaded = False
        self._metadata = None

    def is_loaded(self) -> bool:
        return self._loaded

    def get_metadata(self) -> ModelMetadata | None:
        return self._metadata


class MockInferenceProvider(InferenceProvider):
    """Returns deterministic mock predictions for development / tests."""

    def __init__(self, default_score: float = 0.5) -> None:
        self._default_score = default_score

    def predict(self, inp: InferenceInput) -> InferenceOutput:
        return InferenceOutput(
            predictions={"label": "mock", "raw": None},
            scores={"confidence": self._default_score},
            model_id="mock-model",
            model_version="0.0.0",
        )

    def predict_batch(self, inputs: list[InferenceInput]) -> list[InferenceOutput]:
        return [self.predict(i) for i in inputs]

    @property
    def supported_modalities(self) -> list[str]:
        return ["text", "image", "audio", "video", "document"]


class TextSklearnProvider(ModelProvider):
    """Adapter that wraps the existing learning_service text detector."""

    def __init__(self) -> None:
        self._loaded = False
        self._metadata: ModelMetadata | None = None
        self._service: Any = None

    def load(self, metadata: ModelMetadata) -> None:
        self._metadata = metadata
        self._loaded = True

    def unload(self) -> None:
        self._loaded = False
        self._service = None

    def is_loaded(self) -> bool:
        return self._loaded

    def get_metadata(self) -> ModelMetadata | None:
        return self._metadata


class TextSklearnInference(InferenceProvider):
    """Runs the sklearn ensemble text detector as an InferenceProvider."""

    def __init__(self) -> None:
        self._service: Any = None

    def predict(self, inp: InferenceInput) -> InferenceOutput:
        if inp.modality != "text":
            raise ValueError(f"TextSklearnInference only supports text, got {inp.modality}")
        text = inp.data if isinstance(inp.data, str) else str(inp.data)
        try:
            from app.services.learning_service import LearningService

            if self._service is None:
                self._service = LearningService()
            result = self._service.predict_text(text)
            if not result or result.get("ai_score") is None or result.get("confidence") is None:
                raise RuntimeError("Text detector returned no calibrated prediction")
            return InferenceOutput(
                predictions={"label": "ai" if result.get("is_ai", False) else "human"},
                scores={
                    "ai_score": float(result["ai_score"]),
                    "human_score": float(result.get("human_score", 1.0 - float(result["ai_score"]))),
                    "confidence": float(result["confidence"]),
                },
                model_id="text-sklearn-ensemble",
                model_version="1.0.0",
            )
        except Exception as exc:
            logger.exception("Text detector inference failed")
            raise RuntimeError("Text detector inference unavailable") from exc

    def predict_batch(self, inputs: list[InferenceInput]) -> list[InferenceOutput]:
        return [self.predict(i) for i in inputs]

    @property
    def supported_modalities(self) -> list[str]:
        return ["text"]


# ---------------------------------------------------------------------------
# Registry — maps model IDs to live providers
# ---------------------------------------------------------------------------


class ModelRegistryService:
    """Manages model registrations and provider instances.

    Status lifecycle:
        DEVELOPMENT -> CANDIDATE -> STAGING -> PRODUCTION -> RETIRED

    Only models in PRODUCTION status may be used for inference.
    """

    VALID_TRANSITIONS: dict[ModelProviderStatus, list[ModelProviderStatus]] = {
        ModelProviderStatus.DEVELOPMENT: [ModelProviderStatus.CANDIDATE, ModelProviderStatus.RETIRED],
        ModelProviderStatus.CANDIDATE: [
            ModelProviderStatus.STAGING,
            ModelProviderStatus.DEVELOPMENT,
            ModelProviderStatus.RETIRED,
        ],
        ModelProviderStatus.STAGING: [
            ModelProviderStatus.PRODUCTION,
            ModelProviderStatus.CANDIDATE,
            ModelProviderStatus.RETIRED,
        ],
        ModelProviderStatus.PRODUCTION: [ModelProviderStatus.RETIRED, ModelProviderStatus.STAGING],
        ModelProviderStatus.RETIRED: [],
    }

    def __init__(self) -> None:
        self._providers: dict[str, tuple[ModelProvider, InferenceProvider]] = {}
        self._metadata_cache: dict[str, ModelMetadata] = {}

    def register(
        self,
        model_id: str,
        model_provider: ModelProvider,
        inference_provider: InferenceProvider,
    ) -> None:
        self._providers[model_id] = (model_provider, inference_provider)
        logger.info("Registered model provider: %s", model_id)

    def unregister(self, model_id: str) -> None:
        pair = self._providers.pop(model_id, None)
        if pair:
            pair[0].unload()
        self._metadata_cache.pop(model_id, None)

    def get_provider(self, model_id: str) -> InferenceProvider | None:
        pair = self._providers.get(model_id)
        return pair[1] if pair else None

    def get_model_provider(self, model_id: str) -> ModelProvider | None:
        pair = self._providers.get(model_id)
        return pair[0] if pair else None

    def list_models(self) -> list[str]:
        return list(self._providers.keys())

    def is_loaded(self, model_id: str) -> bool:
        pair = self._providers.get(model_id)
        return pair[0].is_loaded() if pair else False

    def can_transition(self, model_id: str, target_status: ModelProviderStatus) -> bool:
        meta = self._metadata_cache.get(model_id)
        if not meta:
            return False
        allowed = self.VALID_TRANSITIONS.get(meta.status, [])
        return target_status in allowed

    def promote_model(
        self,
        model_id: str,
        target_status: ModelProviderStatus,
    ) -> ModelMetadata | None:
        meta = self._metadata_cache.get(model_id)
        if not meta:
            return None

        if not self.can_transition(model_id, target_status):
            logger.warning(
                "Invalid status transition %s -> %s for model %s",
                meta.status.value,
                target_status.value,
                model_id,
            )
            return None

        promoted_at = meta.promoted_at
        retired_at = meta.retired_at
        if target_status == ModelProviderStatus.PRODUCTION:
            promoted_at = datetime.now(UTC)
        elif target_status == ModelProviderStatus.RETIRED:
            retired_at = datetime.now(UTC)

        updated = ModelMetadata(
            model_id=meta.model_id,
            display_name=meta.display_name,
            version=meta.version,
            modality=meta.modality,
            task=meta.task,
            framework=meta.framework,
            status=target_status,
            dataset_version=meta.dataset_version,
            storage_path=meta.storage_path,
            accuracy=meta.accuracy,
            f1_score=meta.f1_score,
            precision_score=meta.precision_score,
            recall_score=meta.recall_score,
            promoted_at=promoted_at,
            retired_at=retired_at,
            metrics=meta.metrics,
        )
        self._metadata_cache[model_id] = updated
        logger.info("Model %s status: %s -> %s", model_id, meta.status.value, target_status.value)
        return updated

    def get_production_models(self) -> list[ModelMetadata]:
        return [m for m in self._metadata_cache.values() if m.status == ModelProviderStatus.PRODUCTION]

    def get_models_by_modality(self, modality: str) -> list[ModelMetadata]:
        return [m for m in self._metadata_cache.values() if m.modality == modality]

    async def load_from_db(
        self,
        db: AsyncSession,
        modality: str,
        task: str,
        status: ModelProviderStatus = ModelProviderStatus.PRODUCTION,
    ) -> ModelMetadata | None:
        """Load the best production model from the database registry."""
        from sqlalchemy import select

        query = (
            select(ModelRegistry)
            .where(
                ModelRegistry.modality == modality,
                ModelRegistry.task == task,
                ModelRegistry.status == status.value,
            )
            .order_by(ModelRegistry.accuracy.desc().nullslast())
            .limit(1)
        )
        result = await db.execute(query)
        row = result.scalar_one_or_none()
        if not row:
            return None
        meta = ModelMetadata(
            model_id=row.model_id,
            display_name=row.display_name,
            version=row.version,
            modality=row.modality,
            task=row.task,
            framework=ModelFramework(row.framework),
            status=ModelProviderStatus(row.status),
            dataset_version=row.dataset_version,
            storage_path=row.storage_path,
            accuracy=row.accuracy,
            f1_score=row.f1_score,
            precision_score=row.precision_score,
            recall_score=row.recall_score,
            metrics=json.loads(row.metrics_json) if row.metrics_json else {},
        )
        self._metadata_cache[row.model_id] = meta
        return meta


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

model_registry = ModelRegistryService()
