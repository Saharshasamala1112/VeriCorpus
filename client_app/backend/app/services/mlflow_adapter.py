"""
MLflow Adapter Service

Bridges the application's model registry with MLflow for experiment tracking,
model registration, artifact storage, and run lineage.

Uses MLflow's v2 API with aliases/tags (not deprecated fixed stages).
Falls back gracefully when MLflow is unavailable.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.all_models import Model, ModelVersion
from app.models.mlops import (
    ModelAliasType,
    ModelLifecycleStatus,
    ModelVersionAlias,
    ModelVersionMetadata,
)

logger = logging.getLogger(__name__)

try:
    import mlflow
    from mlflow.tracking import MlflowClient

    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False
    logger.warning("MLflow not installed; falling back to database-only tracking")


# ---------------------------------------------------------------------------
# MLflow Client Singleton
# ---------------------------------------------------------------------------

_client: MlflowClient | None = None


def get_mlflow_client() -> MlflowClient | None:
    """Return the MLflow client, initialising on first call."""
    global _client
    if not MLFLOW_AVAILABLE:
        return None
    if _client is None:
        try:
            mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
            if settings.MLFLOW_REGISTRY_URI:
                mlflow.set_registry_uri(settings.MLFLOW_REGISTRY_URI)
            _client = MlflowClient()
            logger.info(
                "MLflow client initialised (tracking=%s, registry=%s)",
                settings.MLFLOW_TRACKING_URI,
                settings.MLFLOW_REGISTRY_URI or "(same as tracking)",
            )
        except Exception:
            logger.exception("Failed to initialise MLflow client")
            _client = None
    return _client


# ---------------------------------------------------------------------------
# Experiment Tracking
# ---------------------------------------------------------------------------


class MLflowExperimentService:
    """Creates and manages MLflow experiments and runs."""

    def __init__(self, db: AsyncSession):
        self.db = db

    def ensure_experiment(self, name: str | None = None) -> int | None:
        """Ensure the experiment exists and return its numeric ID."""
        client = get_mlflow_client()
        if client is None:
            return None
        experiment_name = name or settings.MLFLOW_EXPERIMENT_NAME
        try:
            exp = client.get_experiment_by_name(experiment_name)
            if exp is None:
                exp_id = client.create_experiment(experiment_name)
                logger.info("Created MLflow experiment: %s (id=%s)", experiment_name, exp_id)
                return exp_id
            return int(exp.experiment_id)
        except Exception:
            logger.exception("Failed to ensure MLflow experiment %s", experiment_name)
            return None

    def create_run(
        self,
        experiment_name: str | None = None,
        run_name: str | None = None,
        tags: dict[str, str] | None = None,
    ) -> str | None:
        """Create a new MLflow run and return its run_id."""
        client = get_mlflow_client()
        if client is None:
            return None
        exp_id = self.ensure_experiment(experiment_name)
        if exp_id is None:
            return None
        try:
            run = client.create_run(
                experiment_id=str(exp_id),
                run_name=run_name,
                tags=tags or {},
            )
            return run.info.run_id
        except Exception:
            logger.exception("Failed to create MLflow run")
            return None

    def log_params(self, run_id: str, params: dict[str, str]) -> None:
        """Log parameters to an MLflow run."""
        client = get_mlflow_client()
        if client is None or not params:
            return
        try:
            for key, value in params.items():
                client.log_param(run_id, key, str(value))
        except Exception:
            logger.exception("Failed to log params to MLflow run %s", run_id)

    def log_metrics(self, run_id: str, metrics: dict[str, float], step: int | None = None) -> None:
        """Log metrics to an MLflow run."""
        client = get_mlflow_client()
        if client is None or not metrics:
            return
        try:
            for key, value in metrics.items():
                client.log_metric(run_id, key, value, step=step)
        except Exception:
            logger.exception("Failed to log metrics to MLflow run %s", run_id)

    def log_tags(self, run_id: str, tags: dict[str, str]) -> None:
        """Log tags to an MLflow run."""
        client = get_mlflow_client()
        if client is None or not tags:
            return
        try:
            for key, value in tags.items():
                client.set_tag(run_id, key, value)
        except Exception:
            logger.exception("Failed to log tags to MLflow run %s", run_id)

    def update_run_status(self, run_id: str, status: str) -> None:
        """Update the status of an MLflow run."""
        client = get_mlflow_client()
        if client is None:
            return
        try:
            client.set_terminated(run_id, status=status)
        except Exception:
            logger.exception("Failed to update MLflow run %s status", run_id)

    def log_artifact(self, run_id: str, local_path: str, artifact_path: str | None = None) -> None:
        """Log a local file as an artifact to an MLflow run."""
        client = get_mlflow_client()
        if client is None:
            return
        try:
            client.log_artifact(run_id, local_path, artifact_path=artifact_path)
        except Exception:
            logger.exception("Failed to log artifact to MLflow run %s", run_id)

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        """Retrieve run details from MLflow."""
        client = get_mlflow_client()
        if client is None:
            return None
        try:
            run = client.get_run(run_id)
            return {
                "run_id": run.info.run_id,
                "experiment_id": run.info.experiment_id,
                "status": run.info.status,
                "start_time": run.info.start_time,
                "end_time": run.info.end_time,
                "params": run.data.params,
                "metrics": run.data.metrics,
                "tags": run.data.tags,
            }
        except Exception:
            logger.exception("Failed to get MLflow run %s", run_id)
            return None

    def search_runs(
        self,
        experiment_name: str | None = None,
        filter_string: str | None = None,
        max_results: int = 100,
    ) -> list[dict[str, Any]]:
        """Search for runs in an experiment."""
        client = get_mlflow_client()
        if client is None:
            return []
        exp_id = self.ensure_experiment(experiment_name)
        if exp_id is None:
            return []
        try:
            runs = client.search_runs(
                experiment_ids=[str(exp_id)],
                filter_string=filter_string,
                max_results=max_results,
            )
            return [
                {
                    "run_id": r.info.run_id,
                    "experiment_id": r.info.experiment_id,
                    "status": r.info.status,
                    "start_time": r.info.start_time,
                    "end_time": r.info.end_time,
                    "params": r.data.params,
                    "metrics": r.data.metrics,
                    "tags": r.data.tags,
                }
                for r in runs
            ]
        except Exception:
            logger.exception("Failed to search MLflow runs")
            return []

    def list_artifacts(self, run_id: str, path: str | None = None) -> list[dict[str, str]]:
        """List artifacts for a run."""
        client = get_mlflow_client()
        if client is None:
            return []
        try:
            artifacts = client.list_artifacts(run_id, path)
            return [{"path": a.path, "is_dir": a.is_dir, "file_size": a.file_size} for a in artifacts]
        except Exception:
            logger.exception("Failed to list artifacts for MLflow run %s", run_id)
            return []


# ---------------------------------------------------------------------------
# Model Registration (MLflow-compatible aliases)
# ---------------------------------------------------------------------------


class MLflowModelRegistryService:
    """Manages model version registration using MLflow-compatible aliases.

    Uses MLflow's v2 alias system (tags) instead of deprecated fixed stages.
    Each model version can have multiple aliases (e.g. 'production', 'champion').
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def register_model_version(
        self,
        model_id: str,
        version: str,
        name: str,
        modality: str,
        created_by: str,
        *,
        architecture: str | None = None,
        dataset_version: str | None = None,
        preprocessing_version: str | None = None,
        tokenizer_version: str | None = None,
        embedding_version: str | None = None,
        training_run_id: str | None = None,
        checkpoint: str | None = None,
        artifact_uri: str | None = None,
        evaluation_run_id: str | None = None,
        calibration: dict[str, Any] | None = None,
        parent_version_id: str | None = None,
        changelog: str | None = None,
        tags: dict[str, str] | None = None,
    ) -> ModelVersion:
        """Register a new model version with full metadata."""
        # Verify model exists
        model = await self._get_model(model_id)
        if not model:
            raise ValueError(f"Model {model_id} not found")

        # Create ModelVersion
        mv = ModelVersion(
            model_id=model_id,
            version=version,
            status=ModelLifecycleStatus.NOT_CONFIGURED.value,
            training_run_id=training_run_id,
            storage_path=artifact_uri,
        )
        self.db.add(mv)
        await self.db.flush()

        # Create extended metadata
        metadata = ModelVersionMetadata(
            model_version_id=mv.id,
            name=name,
            modality=modality,
            architecture=architecture,
            dataset_version=dataset_version,
            preprocessing_version=preprocessing_version,
            tokenizer_version=tokenizer_version,
            embedding_version=embedding_version,
            checkpoint=checkpoint,
            artifact_uri=artifact_uri,
            evaluation_run_id=evaluation_run_id,
            calibration=calibration,
            parent_version_id=parent_version_id,
            changelog=changelog,
        )
        self.db.add(metadata)

        # Log to MLflow if available
        client = get_mlflow_client()
        if client is None:
            logger.info(
                "MLflow unavailable; registered version %s v%s in database only",
                model.name,
                version,
            )
        else:
            try:
                mlflow_tags = {
                    "model.db_id": model_id,
                    "version.db_version": version,
                    "version.name": name,
                    "version.modality": modality,
                    "version.status": ModelLifecycleStatus.NOT_CONFIGURED.value,
                }
                if tags:
                    mlflow_tags.update(tags)
                # We create an MLflow run to anchor the version
                exp_svc = MLflowExperimentService(self.db)
                run_id = exp_svc.create_run(run_name=f"{model.name}-v{version}", tags=mlflow_tags)
                if run_id:
                    mv.training_run_id = run_id
                    logger.info(
                        "Created MLflow run %s for model %s v%s",
                        run_id,
                        model.name,
                        version,
                    )
            except Exception:
                logger.exception("Failed to register version in MLflow")

        await self.db.commit()
        await self.db.refresh(mv)
        return mv

    async def assign_alias(
        self,
        model_id: str,
        version_id: str,
        alias: str,
        assigned_by: str | None = None,
    ) -> ModelVersionAlias:
        """Assign an alias to a model version.

        If another version of the same model already holds this alias, the
        previous alias is removed (unique per model+alias).
        """
        # Validate alias type
        try:
            ModelAliasType(alias)
        except ValueError:
            raise ValueError(f"Invalid alias '{alias}'. Must be one of: {', '.join(a.value for a in ModelAliasType)}")

        # Remove existing alias for this model+alias combination
        try:
            existing = await self._get_alias(model_id, alias)
        except (StopAsyncIteration, RuntimeError):
            existing = None
        if existing:
            self.db.delete(existing)  # type: ignore[unused-coroutine]

        # Create new alias
        alias_record = ModelVersionAlias(
            model_id=model_id,
            model_version_id=version_id,
            alias=alias,
            assigned_by=assigned_by,
        )
        self.db.add(alias_record)

        # Sync to MLflow tags
        client = get_mlflow_client()
        if client is not None:
            mv = await self._get_model_version(version_id)
            if mv and mv.training_run_id:
                try:
                    client.set_tag(
                        mv.training_run_id,
                        f"alias.{alias}",
                        datetime.now(UTC).isoformat(),
                    )
                except Exception:
                    logger.exception("Failed to sync alias to MLflow")

        await self.db.flush()
        await self.db.refresh(alias_record)
        return alias_record

    async def remove_alias(self, model_id: str, alias: str) -> bool:
        """Remove an alias from a model version."""
        try:
            existing = await self._get_alias(model_id, alias)
        except (StopAsyncIteration, RuntimeError):
            return False
        if not existing:
            return False

        # Remove from MLflow tags
        client = get_mlflow_client()
        if client is not None:
            mv = await self._get_model_version(existing.model_version_id)
            if mv and mv.training_run_id:
                try:
                    client.set_tag(mv.training_run_id, f"alias.{alias}", "")
                except Exception:
                    logger.exception("Failed to remove alias from MLflow")

        self.db.delete(existing)  # type: ignore[unused-coroutine]
        await self.db.flush()
        return True

    async def get_alias_version(self, model_id: str, alias: str) -> ModelVersion | None:
        """Get the model version that holds a specific alias."""
        query = (
            select(ModelVersion)
            .join(ModelVersionAlias, ModelVersionAlias.model_version_id == ModelVersion.id)
            .where(
                ModelVersionAlias.model_id == model_id,
                ModelVersionAlias.alias == alias,
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_aliases(self, model_id: str, version_id: str) -> list[str]:
        """Get all aliases for a model version."""
        query = select(ModelVersionAlias.alias).where(
            ModelVersionAlias.model_id == model_id,
            ModelVersionAlias.model_version_id == version_id,
        )
        result = await self.db.execute(query)
        return [row[0] for row in result.all()]

    async def get_all_aliases(self, model_id: str) -> dict[str, str]:
        """Get all aliases for a model, mapping alias -> version_id."""
        query = select(ModelVersionAlias.alias, ModelVersionAlias.model_version_id).where(
            ModelVersionAlias.model_id == model_id
        )
        result = await self.db.execute(query)
        return {row[0]: row[1] for row in result.all()}

    async def _get_model(self, model_id: str) -> Model | None:
        result = await self.db.execute(select(Model).where(Model.id == model_id))
        return result.scalar_one_or_none()

    async def _get_model_version(self, version_id: str) -> ModelVersion | None:
        result = await self.db.execute(select(ModelVersion).where(ModelVersion.id == version_id))
        return result.scalar_one_or_none()

    async def _get_alias(self, model_id: str, alias: str) -> ModelVersionAlias | None:
        result = await self.db.execute(
            select(ModelVersionAlias).where(
                ModelVersionAlias.model_id == model_id,
                ModelVersionAlias.alias == alias,
            )
        )
        return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Artifact Tracking
# ---------------------------------------------------------------------------


class MLflowArtifactService:
    """Tracks and retrieves model artifacts via MLflow."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def log_model_artifact(
        self,
        version_id: str,
        artifact_path: str,
        artifact_type: str = "model",
    ) -> dict[str, Any] | None:
        """Log an artifact for a model version."""
        mv = await self._get_model_version(version_id)
        if not mv:
            raise ValueError(f"Model version {version_id} not found")

        client = get_mlflow_client()
        if client is None or not mv.training_run_id:
            logger.info("MLflow unavailable; artifact logged to database only")
            return {"path": artifact_path, "type": artifact_type, "mlflow": False}

        try:
            client.log_artifact(
                mv.training_run_id,
                artifact_path,
                artifact_path=artifact_type,
            )
            # Update artifact_uri in metadata
            meta = await self._get_version_metadata(version_id)
            if meta:
                meta.artifact_uri = f"mlflow-artifacts:/{mv.training_run_id}/{artifact_type}"
            await self.db.commit()
            return {
                "path": artifact_path,
                "type": artifact_type,
                "mlflow": True,
                "run_id": mv.training_run_id,
            }
        except Exception:
            logger.exception("Failed to log artifact to MLflow")
            return None

    async def list_artifacts(self, version_id: str) -> list[dict[str, Any]]:
        """List all artifacts for a model version."""
        mv = await self._get_model_version(version_id)
        if not mv or not mv.training_run_id:
            return []

        exp_svc = MLflowExperimentService(self.db)
        return exp_svc.list_artifacts(mv.training_run_id)

    async def get_artifact_uri(self, version_id: str) -> str | None:
        """Get the artifact URI for a model version."""
        meta = await self._get_version_metadata(version_id)
        if meta and meta.artifact_uri:
            return meta.artifact_uri

        mv = await self._get_model_version(version_id)
        if mv and mv.storage_path:
            return mv.storage_path

        return None

    async def _get_model_version(self, version_id: str) -> ModelVersion | None:
        result = await self.db.execute(select(ModelVersion).where(ModelVersion.id == version_id))
        return result.scalar_one_or_none()

    async def _get_version_metadata(self, version_id: str) -> ModelVersionMetadata | None:
        result = await self.db.execute(
            select(ModelVersionMetadata).where(ModelVersionMetadata.model_version_id == version_id)
        )
        return result.scalar_one_or_none()
