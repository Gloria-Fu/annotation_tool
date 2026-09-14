"""Add task package group authorization.

Revision ID: 0007
Revises: 0006
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    package_columns = {column["name"] for column in inspector.get_columns("task_packages")}
    if "group_access_configured" not in package_columns:
        with op.batch_alter_table("task_packages", recreate="always") as batch_op:
            batch_op.add_column(
                sa.Column(
                    "group_access_configured",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.false(),
                )
            )
    tables = set(inspector.get_table_names())
    if "task_package_groups" not in tables:
        op.create_table(
            "task_package_groups",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("package_id", sa.String(length=36), nullable=False),
            sa.Column("group_id", sa.String(length=36), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["package_id"], ["task_packages.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(["group_id"], ["user_groups.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("package_id", "group_id", name="uq_task_package_group"),
        )
    indexes = {index["name"] for index in sa.inspect(op.get_bind()).get_indexes("task_package_groups")}
    if "ix_task_package_groups_package_id" not in indexes:
        op.create_index(
            "ix_task_package_groups_package_id", "task_package_groups", ["package_id"]
        )
    if "ix_task_package_groups_group_id" not in indexes:
        op.create_index("ix_task_package_groups_group_id", "task_package_groups", ["group_id"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "task_package_groups" in inspector.get_table_names():
        indexes = {index["name"] for index in inspector.get_indexes("task_package_groups")}
        if "ix_task_package_groups_group_id" in indexes:
            op.drop_index("ix_task_package_groups_group_id", table_name="task_package_groups")
        if "ix_task_package_groups_package_id" in indexes:
            op.drop_index("ix_task_package_groups_package_id", table_name="task_package_groups")
        op.drop_table("task_package_groups")
    package_columns = {column["name"] for column in inspector.get_columns("task_packages")}
    if "group_access_configured" in package_columns:
        with op.batch_alter_table("task_packages", recreate="always") as batch_op:
            batch_op.drop_column("group_access_configured")
