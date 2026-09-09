"""Track immutable annotation revision files.

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("annotation_revisions")}
    if "file_path" not in existing:
        op.add_column("annotation_revisions", sa.Column("file_path", sa.String(length=1024), nullable=True))
    if "file_hash" not in existing:
        op.add_column("annotation_revisions", sa.Column("file_hash", sa.String(length=64), nullable=True))


def downgrade() -> None:
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("annotation_revisions")}
    if "file_hash" in existing:
        op.drop_column("annotation_revisions", "file_hash")
    if "file_path" in existing:
        op.drop_column("annotation_revisions", "file_path")
