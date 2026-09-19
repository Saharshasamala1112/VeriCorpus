"""Add full_name, country_code, reset_token fields to users table."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_auth_enhancements"
down_revision: str | Sequence[str] | None = "0005_model_registry_mlops"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    # Add new columns to users table if they don't exist
    with op.batch_alter_table("users") as batch_op:
        if not _column_exists("users", "full_name"):
            batch_op.add_column(
                sa.Column("full_name", sa.String(100), nullable=True)
            )
        if not _column_exists("users", "country_code"):
            batch_op.add_column(
                sa.Column("country_code", sa.String(2), nullable=True)
            )
        if not _column_exists("users", "reset_token"):
            batch_op.add_column(
                sa.Column("reset_token", sa.String(255), nullable=True)
            )
        if not _column_exists("users", "reset_token_expires_at"):
            batch_op.add_column(
                sa.Column("reset_token_expires_at", sa.DateTime(timezone=True), nullable=True)
            )

    # Update existing users with default values
    op.execute("UPDATE users SET full_name = username WHERE full_name IS NULL")
    op.execute("UPDATE users SET country_code = 'IN' WHERE country_code IS NULL")

    # Make columns non-nullable after setting defaults
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("full_name", nullable=False)
        batch_op.alter_column("country_code", nullable=False)

    # Make email non-nullable (it might be nullable in old schema)
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("email", nullable=False)

    # Add unique constraint on email if not exists
    inspector = sa.inspect(op.get_bind())
    indexes = {idx["name"] for idx in inspector.get_indexes("users")}
    if "ix_users_email" not in indexes:
        op.create_index("ix_users_email", "users", ["email"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("reset_token_expires_at")
        batch_op.drop_column("reset_token")
        batch_op.drop_column("country_code")
        batch_op.drop_column("full_name")