"""
Experiment Tracking Service

Manages experiment runs with full parameter, metric, and artifact tracking.
Integrates with MLflow when available.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mlops import ExperimentRun
from app.schemas.mlops import ExperimentRunCreate
from app.services.mlflow_adapter import MLflowExperimentService


class ExperimentTrackingService:
    """Service for experiment tracking with MLflow integration."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.mlflow = MLflowExperimentService(db)

    async def create_experiment_run(
        self,
        data: ExperimentRunCreate,
        created_by: str | None = None,
    ) -> ExperimentRun:
        """Create a new experiment run, optionally backed by MLflow."""
        # Create MLflow run if available
        mlflow_run_id = self.mlflow.create_run(
            experiment_name=data.experiment_name,
            run_name=data.run_id,
            tags={
                "created_by": created_by or "system",
                "git_commit": data.git_commit or "",
            },
        )

        run = ExperimentRun(
            experiment_name=data.experiment_name,
            run_id=data.run_id,
            run_name=data.run_id,
            training_job_id=data.training_job_id,
            status="RUNNING",
            parameters=data.parameters,
            git_commit=data.git_commit,
            environment=data.environment,
            notes=data.notes,
            started_at=datetime.now(UTC),
            created_by=created_by,
        )
        self.db.add(run)

        # Log params to MLflow
        if data.parameters and mlflow_run_id:
            str_params = {k: str(v) for k, v in data.parameters.items()}
            self.mlflow.log_params(mlflow_run_id, str_params)

        await self.db.commit()
        await self.db.refresh(run)
        return run

    async def complete_run(
        self,
        run_id: str,
        metrics: dict[str, Any] | None = None,
        artifacts: list[dict[str, Any]] | None = None,
    ) -> ExperimentRun:
        """Mark an experiment run as completed."""
        run = await self._get_run(run_id)
        if not run:
            raise ValueError(f"Experiment run {run_id} not found")

        now = datetime.now(UTC)
        run.status = "COMPLETED"
        run.ended_at = now
        run.metrics = json.dumps(metrics) if metrics else None
        run.artifacts = json.dumps(artifacts) if artifacts else None
        if run.started_at:
            run.duration_ms = int((now - run.started_at).total_seconds() * 1000)

        # Sync to MLflow
        self.mlflow.update_run_status(run.run_id, "FINISHED")
        if metrics:
            float_metrics = {k: float(v) for k, v in metrics.items() if isinstance(v, (int, float))}
            self.mlflow.log_metrics(run.run_id, float_metrics)

        await self.db.commit()
        await self.db.refresh(run)
        return run

    async def fail_run(
        self,
        run_id: str,
        error_message: str | None = None,
    ) -> ExperimentRun:
        """Mark an experiment run as failed."""
        run = await self._get_run(run_id)
        if not run:
            raise ValueError(f"Experiment run {run_id} not found")

        now = datetime.now(UTC)
        run.status = "FAILED"
        run.ended_at = now
        if run.started_at:
            run.duration_ms = int((now - run.started_at).total_seconds() * 1000)
        if error_message:
            run.notes = (run.notes or "") + f"\n[FAILED] {error_message}"

        self.mlflow.update_run_status(run.run_id, "FAILED")
        await self.db.commit()
        await self.db.refresh(run)
        return run

    async def log_metrics(self, run_id: str, metrics: dict[str, float]) -> ExperimentRun:
        """Log additional metrics to a run."""
        run = await self._get_run(run_id)
        if not run:
            raise ValueError(f"Experiment run {run_id} not found")

        existing_raw: str | None = run.metrics  # type: ignore[assignment]
        existing: dict[str, Any] = json.loads(existing_raw) if existing_raw else {}
        existing.update(metrics)
        run.metrics = json.dumps(existing)

        self.mlflow.log_metrics(run.run_id, metrics)
        await self.db.commit()
        await self.db.refresh(run)
        return run

    async def get_run(self, run_id: str) -> ExperimentRun | None:
        """Get an experiment run by run_id (MLflow-style ID)."""
        return await self._get_run(run_id)

    async def list_runs(
        self,
        experiment_name: str | None = None,
        status: str | None = None,
        model_version_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ExperimentRun]:
        """List experiment runs with optional filters."""
        query = select(ExperimentRun)
        if experiment_name:
            query = query.where(ExperimentRun.experiment_name == experiment_name)
        if status:
            query = query.where(ExperimentRun.status == status)
        if model_version_id:
            query = query.where(ExperimentRun.model_version_id == model_version_id)
        query = query.order_by(ExperimentRun.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def compare_runs(
        self,
        run_ids: list[str],
    ) -> dict[str, Any]:
        """Compare multiple experiment runs side by side."""
        runs = []
        for rid in run_ids:
            run = await self._get_run(rid)
            if run:
                runs.append(run)

        if len(runs) < 2:
            raise ValueError("At least 2 valid run IDs required for comparison")

        # Build comparison
        all_metric_keys: set[str] = set()
        for run in runs:
            raw_metrics: str | None = run.metrics  # type: ignore[assignment]
            parsed = json.loads(raw_metrics) if raw_metrics else {}
            all_metric_keys.update(parsed.keys())

        comparison: dict[str, Any] = {
            "runs": [],
            "metric_comparison": {},
            "best_by_metric": {},
        }

        for run in runs:
            run_raw_metrics: str | None = run.metrics  # type: ignore[assignment]
            parsed_metrics = json.loads(run_raw_metrics) if run_raw_metrics else {}
            run_raw_params: str | None = run.parameters  # type: ignore[assignment]
            parsed_params = json.loads(run_raw_params) if run_raw_params else {}
            comparison["runs"].append(
                {
                    "run_id": run.run_id,
                    "experiment_name": run.experiment_name,
                    "status": run.status,
                    "parameters": parsed_params,
                    "metrics": parsed_metrics,
                    "duration_ms": run.duration_ms,
                    "started_at": run.started_at.isoformat() if run.started_at else None,
                }
            )

        for metric_key in all_metric_keys:
            values = []
            for run in runs:
                run_raw_metrics2: str | None = run.metrics  # type: ignore[assignment]
                parsed = json.loads(run_raw_metrics2) if run_raw_metrics2 else {}
                val = parsed.get(metric_key)
                if val is not None:
                    values.append({"run_id": run.run_id, "value": float(val)})
            if values:
                comparison["metric_comparison"][metric_key] = values

                def _get_value(item: dict[str, Any]) -> float:
                    v = item.get("value", 0)
                    return float(v) if v is not None else 0.0

                best = max(values, key=_get_value)
                comparison["best_by_metric"][metric_key] = best["run_id"]

        return comparison

    async def _get_run(self, run_id: str) -> ExperimentRun | None:
        query = select(ExperimentRun).where(ExperimentRun.run_id == run_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
