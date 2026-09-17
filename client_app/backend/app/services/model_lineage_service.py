"""
Model Lineage Service

Tracks the full lineage graph of model versions: training provenance,
promotion paths, and rollback chains.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.all_models import ModelVersion
from app.models.mlops import ModelLifecycleStatus, ModelLineageEdge


class ModelLineageService:
    """Service for model lineage tracking."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def add_edge(
        self,
        model_id: str,
        from_version_id: str,
        to_version_id: str,
        edge_type: str,
        label: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ModelLineageEdge:
        """Add a lineage edge between two model versions."""
        edge = ModelLineageEdge(
            model_id=model_id,
            from_version_id=from_version_id,
            to_version_id=to_version_id,
            edge_type=edge_type,
            label=label,
            metadata_=json.dumps(metadata) if metadata else None,
        )
        self.db.add(edge)
        await self.db.flush()
        await self.db.refresh(edge)
        return edge

    async def get_lineage(self, model_id: str) -> dict[str, Any]:
        """Get the full lineage graph for a model.

        Returns nodes (versions) and edges (relationships) suitable for
        rendering a lineage graph in the frontend.
        """
        # Get all versions
        versions_query = select(ModelVersion).where(ModelVersion.model_id == model_id).order_by(ModelVersion.created_at)
        result = await self.db.execute(versions_query)
        versions = list(result.scalars().all())

        # Get all edges
        edges_query = (
            select(ModelLineageEdge).where(ModelLineageEdge.model_id == model_id).order_by(ModelLineageEdge.created_at)
        )
        result = await self.db.execute(edges_query)
        edges = list(result.scalars().all())

        nodes = []
        for v in versions:
            raw_metrics: str | None = v.metrics  # type: ignore[assignment]
            parsed_metrics = json.loads(raw_metrics) if raw_metrics else {}
            nodes.append(
                {
                    "id": v.id,
                    "version": v.version,
                    "status": v.status,
                    "metrics": parsed_metrics,
                    "created_at": v.created_at.isoformat() if v.created_at else None,
                }
            )

        edge_list = []
        for e in edges:
            meta_raw: str | None = e.metadata_  # type: ignore[assignment]
            parsed_meta = json.loads(meta_raw) if meta_raw else {}
            edge_list.append(
                {
                    "from": e.from_version_id,
                    "to": e.to_version_id,
                    "type": e.edge_type,
                    "label": e.label,
                    "metadata": parsed_meta,
                }
            )

        return {
            "model_id": model_id,
            "versions": nodes,
            "edges": edge_list,
        }

    async def get_version_lineage(self, version_id: str) -> dict[str, Any]:
        """Get lineage for a specific version (ancestors and descendants)."""
        # Get ancestors
        ancestors_query = (
            select(ModelLineageEdge)
            .where(ModelLineageEdge.to_version_id == version_id)
            .order_by(ModelLineageEdge.created_at)
        )
        result = await self.db.execute(ancestors_query)
        ancestors = list(result.scalars().all())

        # Get descendants
        descendants_query = (
            select(ModelLineageEdge)
            .where(ModelLineageEdge.from_version_id == version_id)
            .order_by(ModelLineageEdge.created_at)
        )
        result = await self.db.execute(descendants_query)
        descendants = list(result.scalars().all())

        return {
            "version_id": version_id,
            "ancestors": [
                {
                    "from_version_id": e.from_version_id,
                    "edge_type": e.edge_type,
                    "label": e.label,
                }
                for e in ancestors
            ],
            "descendants": [
                {
                    "to_version_id": e.to_version_id,
                    "edge_type": e.edge_type,
                    "label": e.label,
                }
                for e in descendants
            ],
        }

    async def get_production_lineage(self, model_id: str) -> dict[str, Any] | None:
        """Get the lineage path from the first version to the current production version."""
        # Find production version
        prod_query = (
            select(ModelVersion)
            .where(
                ModelVersion.model_id == model_id,
                ModelVersion.status == ModelLifecycleStatus.PRODUCTION.value,
            )
            .limit(1)
        )
        result = await self.db.execute(prod_query)
        prod_version = result.scalar_one_or_none()
        if not prod_version:
            return None

        # Trace back the lineage chain
        path = [prod_version]
        current = prod_version
        while current:
            edge_query = select(ModelLineageEdge).where(ModelLineageEdge.to_version_id == current.id).limit(1)
            result = await self.db.execute(edge_query)
            edge = result.scalar_one_or_none()
            if edge:
                prev_query = select(ModelVersion).where(ModelVersion.id == edge.from_version_id)
                result = await self.db.execute(prev_query)
                prev = result.scalar_one_or_none()
                if prev and prev.id != current.id:
                    path.insert(0, prev)
                    current = prev
                else:
                    break
            else:
                break

        return {
            "model_id": model_id,
            "production_version_id": prod_version.id,
            "chain": [
                {
                    "id": v.id,
                    "version": v.version,
                    "status": v.status,
                    "created_at": v.created_at.isoformat() if v.created_at else None,
                }
                for v in path
            ],
        }
