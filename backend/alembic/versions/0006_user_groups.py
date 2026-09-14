"""Add global user groups and memberships.

Revision ID: 0006
Revises: 0005
"""
import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    if "user_groups" not in tables:
        op.create_table(
            "user_groups",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("description", sa.String(length=500), nullable=True),
            sa.Column("created_by_id", sa.String(length=36), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name", name="uq_user_group_name"),
        )
    indexes = {index["name"] for index in inspector.get_indexes("user_groups")}
    if "ix_user_groups_created_by_id" not in indexes:
        op.create_index("ix_user_groups_created_by_id", "user_groups", ["created_by_id"])

    if "user_group_members" not in tables:
        op.create_table(
            "user_group_members",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("group_id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["group_id"], ["user_groups.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("group_id", "user_id", name="uq_user_group_member"),
        )
    indexes = {index["name"] for index in sa.inspect(op.get_bind()).get_indexes("user_group_members")}
    if "ix_user_group_members_group_id" not in indexes:
        op.create_index("ix_user_group_members_group_id", "user_group_members", ["group_id"])
    if "ix_user_group_members_user_id" not in indexes:
        op.create_index("ix_user_group_members_user_id", "user_group_members", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_group_members")
    op.drop_index("ix_user_groups_created_by_id", table_name="user_groups")
    op.drop_table("user_groups")
