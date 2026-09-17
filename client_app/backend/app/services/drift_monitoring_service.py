"""
Dataset Drift Monitoring Service

Monitors distribution drift across language, modality, class, confidence,
and input distributions. Implements hooks for drift detection and alerting.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mlops import DriftSnapshot
from app.schemas.mlops import DriftAlert, DriftSnapshotCreate


class DriftMonitoringService:
    """Service for dataset drift monitoring."""

    # Drift thresholds
    DRIFT_THRESHOLDS = {
        "language_distribution": 0.1,
        "modality_distribution": 0.1,
        "class_distribution": 0.15,
        "confidence_distribution": 0.1,
        "input_distribution": 0.2,
    }

    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Snapshot Management ───────────────────────────────────────────────

    async def create_snapshot(
        self,
        data: DriftSnapshotCreate,
    ) -> DriftSnapshot:
        """Create a drift snapshot and calculate drift score."""
        # Get baseline value if available
        baseline_value = data.baseline_value
        if baseline_value is None:
            baseline_value = await self._get_baseline_value(data.model_id, data.metric_type, data.metric_name)

        # Calculate drift score
        drift_score = None
        is_drifting = False
        if baseline_value is not None and baseline_value > 0:
            drift_score = abs(data.metric_value - baseline_value) / baseline_value
            threshold = self.DRIFT_THRESHOLDS.get(data.metric_type, 0.1)
            is_drifting = drift_score > threshold

        snapshot = DriftSnapshot(
            model_id=data.model_id,
            metric_type=data.metric_type,
            metric_name=data.metric_name,
            metric_value=data.metric_value,
            baseline_value=baseline_value,
            drift_score=drift_score,
            is_drifting=is_drifting,
            sample_size=data.sample_size,
            metadata_=data.metadata,
        )
        self.db.add(snapshot)
        await self.db.commit()
        await self.db.refresh(snapshot)
        return snapshot

    async def get_snapshots(
        self,
        model_id: str,
        metric_type: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[DriftSnapshot]:
        """Get drift snapshots for a model."""
        query = select(DriftSnapshot).where(DriftSnapshot.model_id == model_id)
        if metric_type:
            query = query.where(DriftSnapshot.metric_type == metric_type)
        query = query.order_by(DriftSnapshot.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_latest_snapshots(
        self,
        model_id: str,
    ) -> list[DriftSnapshot]:
        """Get the latest snapshot for each metric type."""
        # First get the latest created_at for each metric type
        latest_dates = (
            select(
                DriftSnapshot.metric_type,
                func.max(DriftSnapshot.created_at).label("max_created"),
            )
            .where(DriftSnapshot.model_id == model_id)
            .group_by(DriftSnapshot.metric_type)
        ).subquery()

        # Then get the full snapshots
        query = select(DriftSnapshot).where(
            DriftSnapshot.model_id == model_id,
            DriftSnapshot.created_at.in_(select(latest_dates.c.max_created)),
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ─── Drift Detection ───────────────────────────────────────────────────

    async def detect_drift(
        self,
        model_id: str,
    ) -> list[DriftAlert]:
        """Detect drift for all metrics of a model."""
        latest_snapshots = await self.get_latest_snapshots(model_id)
        alerts = []

        for snapshot in latest_snapshots:
            if snapshot.is_drifting and snapshot.drift_score is not None:
                severity = self._calculate_severity(snapshot.drift_score, snapshot.metric_type)
                alerts.append(
                    DriftAlert(
                        model_id=model_id,
                        metric_type=snapshot.metric_type,
                        metric_name=snapshot.metric_name,
                        current_value=snapshot.metric_value,
                        baseline_value=snapshot.baseline_value or 0.0,
                        drift_score=snapshot.drift_score,
                        severity=severity,
                    )
                )

        return alerts

    async def get_drift_summary(
        self,
        model_id: str,
    ) -> dict[str, Any]:
        """Get a summary of drift status for a model."""
        latest_snapshots = await self.get_latest_snapshots(model_id)

        total_metrics = len(latest_snapshots)
        drifting_metrics = sum(1 for s in latest_snapshots if s.is_drifting)
        avg_drift_score = (
            sum(s.drift_score or 0 for s in latest_snapshots) / total_metrics if total_metrics > 0 else 0.0
        )

        alerts = await self.detect_drift(model_id)
        severity_counts = {"low": 0, "medium": 0, "high": 0, "critical": 0}
        for alert in alerts:
            severity_counts[alert.severity] += 1

        return {
            "model_id": model_id,
            "total_metrics": total_metrics,
            "drifting_metrics": drifting_metrics,
            "stable_metrics": total_metrics - drifting_metrics,
            "drift_percentage": (drifting_metrics / total_metrics * 100) if total_metrics > 0 else 0.0,
            "average_drift_score": round(avg_drift_score, 4),
            "alerts": [alert.model_dump() for alert in alerts],
            "severity_distribution": severity_counts,
            "status": "healthy" if drifting_metrics == 0 else "warning" if drifting_metrics <= 2 else "critical",
        }

    # ─── Baseline Management ───────────────────────────────────────────────

    async def set_baseline(
        self,
        model_id: str,
        metric_type: str,
        metric_name: str,
        baseline_value: float,
    ) -> DriftSnapshot:
        """Set a baseline value for a metric."""
        snapshot = DriftSnapshot(
            model_id=model_id,
            metric_type=metric_type,
            metric_name=metric_name,
            metric_value=baseline_value,
            baseline_value=baseline_value,
            drift_score=0.0,
            is_drifting=False,
            sample_size=0,
            metadata_={"type": "baseline"},
        )
        self.db.add(snapshot)
        await self.db.commit()
        await self.db.refresh(snapshot)
        return snapshot

    async def _get_baseline_value(
        self,
        model_id: str,
        metric_type: str,
        metric_name: str,
    ) -> float | None:
        """Get the baseline value for a metric."""
        query = (
            select(DriftSnapshot)
            .where(
                DriftSnapshot.model_id == model_id,
                DriftSnapshot.metric_type == metric_type,
                DriftSnapshot.metric_name == metric_name,
                DriftSnapshot.metadata_["type"].as_string() == "baseline",
            )
            .order_by(DriftSnapshot.created_at.desc())
            .limit(1)
        )
        result = await self.db.execute(query)
        snapshot = result.scalar_one_or_none()
        return snapshot.metric_value if snapshot else None

    # ─── Helper Methods ────────────────────────────────────────────────────

    def _calculate_severity(self, drift_score: float, metric_type: str) -> str:
        """Calculate drift severity based on score and metric type."""
        threshold = self.DRIFT_THRESHOLDS.get(metric_type, 0.1)

        if drift_score > threshold * 3:
            return "critical"
        elif drift_score > threshold * 2:
            return "high"
        elif drift_score > threshold * 1.5:
            return "medium"
        else:
            return "low"
