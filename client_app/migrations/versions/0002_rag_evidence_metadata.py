"""Add RAG query, source, and evidence provenance metadata."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_rag_evidence_metadata"
down_revision: str | Sequence[str] | None = "0001_core_domain"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    additions = {
        "retrieval_queries": [
            sa.Column("normalized_query", sa.Text(), nullable=True),
            sa.Column("query_analysis_json", sa.Text(), nullable=True),
        ],
        "search_sources": [
            sa.Column("title", sa.String(length=500), nullable=True),
            sa.Column("publisher", sa.String(length=300), nullable=True),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("relevance_score", sa.Float(), nullable=True),
            sa.Column("content_hash", sa.String(length=64), nullable=True),
            sa.Column("authority_score", sa.Float(), nullable=True),
            sa.Column(
                "provenance",
                sa.String(length=20),
                nullable=False,
                server_default="external",
            ),
        ],
        "retrieval_results": [
            sa.Column(
                "provenance",
                sa.String(length=20),
                nullable=False,
                server_default="external",
            )
        ],
        "evidence": [
            sa.Column(
                "provenance",
                sa.String(length=20),
                nullable=False,
                server_default="external",
            ),
            sa.Column("content_hash", sa.String(length=64), nullable=True),
        ],
    }
    for table, columns in additions.items():
        existing = {column["name"] for column in inspector.get_columns(table)}
        missing = [column for column in columns if column.name not in existing]
        if missing:
            with op.batch_alter_table(table) as batch:
                for column in missing:
                    batch.add_column(column)
    if "ix_search_sources_content_hash" not in {
        index["name"] for index in inspector.get_indexes("search_sources")
    }:
        with op.batch_alter_table("search_sources") as batch:
            batch.create_index("ix_search_sources_content_hash", ["content_hash"])


def downgrade() -> None:
    with op.batch_alter_table("evidence") as batch:
        batch.drop_column("content_hash")
        batch.drop_column("provenance")

    with op.batch_alter_table("retrieval_results") as batch:
        batch.drop_column("provenance")

    with op.batch_alter_table("search_sources") as batch:
        batch.drop_index("ix_search_sources_content_hash")
        batch.drop_column("provenance")
        batch.drop_column("authority_score")
        batch.drop_column("content_hash")
        batch.drop_column("relevance_score")
        batch.drop_column("last_verified_at")
        batch.drop_column("published_at")
        batch.drop_column("publisher")
        batch.drop_column("title")

    with op.batch_alter_table("retrieval_queries") as batch:
        batch.drop_column("query_analysis_json")
        batch.drop_column("normalized_query")
