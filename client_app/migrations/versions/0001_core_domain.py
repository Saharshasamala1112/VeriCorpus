"""Create the VeriCorpus persistence domain.

This baseline migration imports the canonical SQLAlchemy metadata so a clean
deployment receives the compatible legacy tables plus the normalized v2
intelligence, provenance, and MLOps tables. It intentionally inserts no data.
"""

from collections.abc import Sequence

import app.models  # noqa: F401
from alembic import op
from app.models.base import Base

revision: str = "0001_core_domain"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, checkfirst=True)
