"""Add structured plagiarism match spans and retrieval lineage."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_similarity_match_lineage"
down_revision: str | Sequence[str] | None = "0003_ai_detection_result_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing = {column["name"] for column in inspector.get_columns("similarity_matches")}
    columns = [
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
        sa.Column("matched_text", sa.Text(), nullable=True),
        sa.Column("input_span_json", sa.Text(), nullable=True),
        sa.Column("source_span_json", sa.Text(), nullable=True),
        sa.Column("location_json", sa.Text(), nullable=True),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=True),
    ]
    with op.batch_alter_table("similarity_matches") as batch:
        for column in columns:
            if column.name not in existing:
                batch.add_column(column)


def downgrade() -> None:
    with op.batch_alter_table("similarity_matches") as batch:
        batch.drop_column("matched_text")
        batch.drop_column("retrieved_at")
        batch.drop_column("location_json")
        batch.drop_column("source_span_json")
        batch.drop_column("input_span_json")
        batch.drop_column("confidence")
