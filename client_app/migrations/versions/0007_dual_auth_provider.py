"""Add auth_provider and corpus_user_id for dual authentication support."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_dual_auth_provider"
down_revision: str | Sequence[str] | None = "0006_auth_enhancements"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    indexes = {idx["name"] for idx in inspector.get_indexes(table_name)}
    return index_name in indexes


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        # Add auth_provider column (default "local" for existing users)
        if not _column_exists("users", "auth_provider"):
            batch_op.add_column(
                sa.Column("auth_provider", sa.String(20), nullable=False, server_default="local")
            )

        # Add corpus_user_id column (nullable, unique for Corpus users)
        if not _column_exists("users", "corpus_user_id"):
            batch_op.add_column(
                sa.Column("corpus_user_id", sa.String(255), nullable=True)
            )

        # Make password_hash nullable (Corpus users don't have local passwords)
        # Existing local users will keep their password_hash
        batch_op.alter_column("password_hash", nullable=True)

    # Set auth_provider for existing users based on corpus_token presence
    op.execute(
        "UPDATE users SET auth_provider = 'corpus' WHERE corpus_token IS NOT NULL AND auth_provider = 'local'"
    )

    # Add unique constraint on corpus_user_id (only for non-null values)
    if not _index_exists("users", "ix_users_corpus_user_id"):
        op.create_index("ix_users_corpus_user_id", "users", ["corpus_user_id"], unique=True)

    # Add index on auth_provider for fast lookups
    if not _index_exists("users", "ix_users_auth_provider"):
        op.create_index("ix_users_auth_provider", "users", ["auth_provider"])


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("corpus_user_id")
        batch_op.drop_column("auth_provider")
        # Restore password_hash to non-nullable (existing users all have it)
        batch_op.alter_column("password_hash", nullable=False)

    op.drop_index("ix_users_auth_provider", table_name="users")
    op.drop_index("ix_users_corpus_user_id", table_name="users")
