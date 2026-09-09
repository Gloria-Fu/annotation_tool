"""Add task package member restrictions.

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_package_members",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("package_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["package_id"], ["task_packages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("package_id", "user_id", name="uq_task_package_member"),
    )
    op.create_index("ix_task_package_members_package_id", "task_package_members", ["package_id"])
    op.create_index("ix_task_package_members_user_id", "task_package_members", ["user_id"])


def downgrade() -> None:
    op.drop_table("task_package_members")
