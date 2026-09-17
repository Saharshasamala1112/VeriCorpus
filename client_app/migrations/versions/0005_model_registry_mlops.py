"""Add model registry, aliases, lineage, comparison, and inference tracking tables."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_model_registry_mlops"
down_revision: str | Sequence[str] | None = "0004_similarity_match_lineage"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ─── Model Version Aliases ──────────────────────────────────────────────
    op.create_table(
        "model_version_aliases",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("model_id", sa.String(36), sa.ForeignKey("models.id"), nullable=False),
        sa.Column("model_version_id", sa.String(36), sa.ForeignKey("model_versions.id"), nullable=False),
        sa.Column("alias", sa.String(50), nullable=False),
        sa.Column("assigned_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("model_id", "alias", name="uq_model_alias"),
    )
    op.create_index("idx_mva_model", "model_version_aliases", ["model_id"])
    op.create_index("idx_mva_alias", "model_version_aliases", ["alias"])

    # ─── Model Version Extended Metadata ────────────────────────────────────
    op.create_table(
        "model_version_metadata",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "model_version_id",
            sa.String(36),
            sa.ForeignKey("model_versions.id"),
            unique=True,
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("modality", sa.String(20), nullable=False),
        sa.Column("architecture", sa.String(200), nullable=True),
        sa.Column("dataset_version", sa.String(50), nullable=True),
        sa.Column("preprocessing_version", sa.String(50), nullable=True),
        sa.Column("tokenizer_version", sa.String(50), nullable=True),
        sa.Column("embedding_version", sa.String(50), nullable=True),
        sa.Column("checkpoint", sa.String(1000), nullable=True),
        sa.Column("artifact_uri", sa.String(1000), nullable=True),
        sa.Column("evaluation_run_id", sa.String(100), nullable=True),
        sa.Column("calibration", sa.JSON(), nullable=True),
        sa.Column("deployment", sa.JSON(), nullable=True),
        sa.Column("retirement_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "parent_version_id",
            sa.String(36),
            sa.ForeignKey("model_versions.id"),
            nullable=True,
        ),
        sa.Column("changelog", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_mvm_version", "model_version_metadata", ["model_version_id"])

    # ─── Model Comparisons ──────────────────────────────────────────────────
    op.create_table(
        "model_comparisons",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "production_version_id",
            sa.String(36),
            sa.ForeignKey("model_versions.id"),
            nullable=False,
        ),
        sa.Column(
            "candidate_version_id",
            sa.String(36),
            sa.ForeignKey("model_versions.id"),
            nullable=False,
        ),
        sa.Column("overall_winner", sa.String(20), nullable=False),
        sa.Column("overall_score_delta", sa.Float(), nullable=False),
        sa.Column("metrics_comparison", sa.JSON(), nullable=True),
        sa.Column("per_modality_comparison", sa.JSON(), nullable=True),
        sa.Column("false_positive_delta", sa.Float(), nullable=True),
        sa.Column("false_negative_delta", sa.Float(), nullable=True),
        sa.Column("calibration_delta", sa.Float(), nullable=True),
        sa.Column("regression_detected", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("regression_details", sa.JSON(), nullable=True),
        sa.Column("promotion_recommendation", sa.String(20), nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_mc_candidate", "model_comparisons", ["candidate_version_id"])

    # ─── Model Lineage Edges ────────────────────────────────────────────────
    op.create_table(
        "model_lineage_edges",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("model_id", sa.String(36), sa.ForeignKey("models.id"), nullable=False),
        sa.Column(
            "from_version_id",
            sa.String(36),
            sa.ForeignKey("model_versions.id"),
            nullable=False,
        ),
        sa.Column(
            "to_version_id",
            sa.String(36),
            sa.ForeignKey("model_versions.id"),
            nullable=False,
        ),
        sa.Column("edge_type", sa.String(50), nullable=False),
        sa.Column("label", sa.String(200), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_mle_from", "model_lineage_edges", ["from_version_id"])
    op.create_index("idx_mle_to", "model_lineage_edges", ["to_version_id"])

    # ─── Production Inference Records ───────────────────────────────────────
    op.create_table(
        "production_inference_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("request_id", sa.String(100), nullable=False),
        sa.Column("model_id", sa.String(36), sa.ForeignKey("models.id"), nullable=False),
        sa.Column(
            "model_version_id",
            sa.String(36),
            sa.ForeignKey("model_versions.id"),
            nullable=False,
        ),
        sa.Column("alias_at_inference", sa.String(50), nullable=True),
        sa.Column("endpoint", sa.String(200), nullable=True),
        sa.Column("environment", sa.String(50), nullable=True),
        sa.Column("latency_ms", sa.Float(), nullable=True),
        sa.Column("input_hash", sa.String(64), nullable=True),
        sa.Column("output_summary", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_pir_model_version", "production_inference_records", ["model_version_id"])
    op.create_index("idx_pir_request_id", "production_inference_records", ["request_id"])


def downgrade() -> None:
    op.drop_table("production_inference_records")
    op.drop_table("model_lineage_edges")
    op.drop_table("model_comparisons")
    op.drop_table("model_version_metadata")
    op.drop_table("model_version_aliases")
