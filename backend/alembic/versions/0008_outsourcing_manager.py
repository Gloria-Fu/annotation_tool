"""Add outsourcing manager ownership to user groups.

Revision ID: 0008
Revises: 0007
"""
import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("user_groups")}
    if "manager_id" not in columns:
        with op.batch_alter_table("user_groups", recreate="always") as batch_op:
            batch_op.add_column(sa.Column("manager_id", sa.String(length=36), nullable=True))
            batch_op.create_foreign_key(
                "fk_user_groups_manager_id",
                "users",
                ["manager_id"],
                ["id"],
            )
            batch_op.create_index("ix_user_groups_manager_id", ["manager_id"])


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("user_groups")}
    if "manager_id" in columns:
        with op.batch_alter_table("user_groups", recreate="always") as batch_op:
            batch_op.drop_index("ix_user_groups_manager_id")
            batch_op.drop_column("manager_id")
