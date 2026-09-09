"""Initial schema.

Revision ID: 0001
Revises:
"""
from alembic import op

from app.database import Base
from app import models  # noqa: F401

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    tables = [table for table in Base.metadata.sorted_tables if table.name != "task_package_members"]
    Base.metadata.create_all(bind=op.get_bind(), tables=tables)


def downgrade() -> None:
    tables = [table for table in Base.metadata.sorted_tables if table.name != "task_package_members"]
    Base.metadata.drop_all(bind=op.get_bind(), tables=tables)
