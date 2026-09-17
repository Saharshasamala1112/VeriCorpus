"""Add calibrated AI-content detection result fields."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_ai_detection_result_fields"
down_revision: str | Sequence[str] | None = "0002_rag_evidence_metadata"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing = {
        column["name"] for column in inspector.get_columns("analysis_job_results_v2")
    }
    missing = [
        sa.Column("model_probability", sa.Float(), nullable=True),
        sa.Column("calibrated_probability", sa.Float(), nullable=True),
        sa.Column("evidence_strength", sa.Float(), nullable=True),
    ]
    with op.batch_alter_table("analysis_job_results_v2") as batch:
        for column in missing:
            if column.name not in existing:
                batch.add_column(column)


def downgrade() -> None:
    with op.batch_alter_table("analysis_job_results_v2") as batch:
        batch.drop_column("evidence_strength")
        batch.drop_column("calibrated_probability")
        batch.drop_column("model_probability")
