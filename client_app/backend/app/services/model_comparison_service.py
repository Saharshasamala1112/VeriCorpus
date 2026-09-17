"""
Model Comparison Service

Provides head-to-head comparisons between candidate and production model versions,
including per-metric analysis and promotion recommendations.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.all_models import ModelVersion
from app.models.mlops import ModelComparison


class ModelComparisonService:
    """Service for model comparison and analysis."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def compare_versions(
        self,
        production_version_id: str,
        candidate_version_id: str,
        created_by: str | None = None,
    ) -> ModelComparison:
        """Compare a candidate model version against the production version."""
        prod_mv = await self._get_version(production_version_id)
        cand_mv = await self._get_version(candidate_version_id)
        if not prod_mv:
            raise ValueError(f"Production version {production_version_id} not found")
        if not cand_mv:
            raise ValueError(f"Candidate version {candidate_version_id} not found")

        # Parse metrics from both versions
        prod_metrics = json.loads(prod_mv.metrics or "{}")
        cand_metrics = json.loads(cand_mv.metrics or "{}")

        # Build per-metric comparison
        metrics_comparison = self._compare_metrics(prod_metrics, cand_metrics)

        # Calculate overall score delta
        overall_score_delta = self._calculate_overall_delta(metrics_comparison)

        # Determine winner
        if overall_score_delta > 0.01:
            winner = "candidate"
        elif overall_score_delta < -0.01:
            winner = "production"
        else:
            winner = "tie"

        # Check for regressions
        regression_detected = any(
            mc.get("winner") == "production" and mc.get("required_for_promotion", False) for mc in metrics_comparison
        )
        regression_details = [
            mc["metric"]
            for mc in metrics_comparison
            if mc.get("winner") == "production" and mc.get("required_for_promotion", False)
        ]

        # Promotion recommendation
        if regression_detected:
            recommendation = "reject"
        elif winner == "candidate":
            recommendation = "promote"
        else:
            recommendation = "needs_review"

        comparison = ModelComparison(
            production_version_id=production_version_id,
            candidate_version_id=candidate_version_id,
            overall_winner=winner,
            overall_score_delta=round(overall_score_delta, 6),
            metrics_comparison=json.dumps(metrics_comparison),
            regression_detected=regression_detected,
            regression_details=json.dumps(regression_details),
            promotion_recommendation=recommendation,
            created_by=created_by,
        )
        self.db.add(comparison)
        await self.db.commit()
        await self.db.refresh(comparison)
        return comparison

    async def get_comparison(self, comparison_id: str) -> ModelComparison | None:
        """Get a comparison by ID."""
        result = await self.db.execute(select(ModelComparison).where(ModelComparison.id == comparison_id))
        return result.scalar_one_or_none()

    async def list_comparisons(
        self,
        candidate_version_id: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[ModelComparison]:
        """List comparisons with optional filters."""
        query = select(ModelComparison)
        if candidate_version_id:
            query = query.where(ModelComparison.candidate_version_id == candidate_version_id)
        query = query.order_by(ModelComparison.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_latest_comparison(self, model_id: str) -> ModelComparison | None:
        """Get the most recent comparison for a model."""
        query = (
            select(ModelComparison)
            .join(ModelVersion, ModelVersion.id == ModelComparison.candidate_version_id)
            .where(ModelVersion.model_id == model_id)
            .order_by(ModelComparison.created_at.desc())
            .limit(1)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    def _compare_metrics(
        self,
        prod_metrics: dict[str, Any],
        cand_metrics: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Compare individual metrics between production and candidate."""
        required_metrics = {"accuracy", "f1_score", "precision", "recall", "auroc"}
        comparisons = []

        all_keys = set(prod_metrics.keys()) | set(cand_metrics.keys())
        for key in sorted(all_keys):
            prod_val = prod_metrics.get(key)
            cand_val = cand_metrics.get(key)

            if prod_val is None or cand_val is None:
                continue
            try:
                prod_f = float(prod_val)
                cand_f = float(cand_val)
            except (TypeError, ValueError):
                continue

            delta = cand_f - prod_f
            pct_delta = (delta / prod_f * 100) if prod_f != 0 else 0.0

            if delta > 0.001:
                metric_winner = "candidate"
            elif delta < -0.001:
                metric_winner = "production"
            else:
                metric_winner = "tie"

            comparisons.append(
                {
                    "metric": key,
                    "production": prod_f,
                    "candidate": cand_f,
                    "delta": round(delta, 6),
                    "percentage_delta": round(pct_delta, 2),
                    "winner": metric_winner,
                    "required_for_promotion": key in required_metrics,
                }
            )

        return comparisons

    def _calculate_overall_delta(self, metrics_comparison: list[dict[str, Any]]) -> float:
        """Calculate weighted overall score delta."""
        if not metrics_comparison:
            return 0.0

        total_weight = 0.0
        weighted_delta = 0.0
        for mc in metrics_comparison:
            weight = 2.0 if mc.get("required_for_promotion") else 1.0
            weighted_delta += mc["delta"] * weight
            total_weight += weight

        return weighted_delta / total_weight if total_weight > 0 else 0.0

    async def _get_version(self, version_id: str) -> ModelVersion | None:
        result = await self.db.execute(select(ModelVersion).where(ModelVersion.id == version_id))
        return result.scalar_one_or_none()
