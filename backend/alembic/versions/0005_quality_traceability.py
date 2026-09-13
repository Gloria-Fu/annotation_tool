"""Persist quality sampling batches and revision references.

Revision ID: 0005
Revises: 0004
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    if "quality_batches" not in tables:
        op.create_table(
            "quality_batches",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("project_id", sa.String(length=36), nullable=False),
            sa.Column("package_id", sa.String(length=36), nullable=False),
            sa.Column("created_by_id", sa.String(length=36), nullable=False),
            sa.Column("assignee_id", sa.String(length=36), nullable=True),
            sa.Column("mode", sa.String(length=16), nullable=False),
            sa.Column("sample_percent", sa.Integer(), nullable=True),
            sa.Column("sample_count", sa.Integer(), nullable=True),
            sa.Column("seed", sa.String(length=128), nullable=False),
            sa.Column("only_unchecked", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="open"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
            sa.ForeignKeyConstraint(["package_id"], ["task_packages.id"]),
            sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["assignee_id"], ["users.id"]),
        )
    batch_columns = {column["name"] for column in inspector.get_columns("quality_batches")}
    if "assignee_id" not in batch_columns:
        with op.batch_alter_table("quality_batches", recreate="always") as batch_op:
            batch_op.add_column(sa.Column("assignee_id", sa.String(length=36), nullable=True))
            batch_op.create_foreign_key(
                "fk_quality_batches_assignee_id",
                "users",
                ["assignee_id"],
                ["id"],
            )
    indexes = {index["name"] for index in inspector.get_indexes("quality_batches")}
    if "ix_quality_batches_project_id" not in indexes:
        op.create_index("ix_quality_batches_project_id", "quality_batches", ["project_id"])
    if "ix_quality_batches_package_id" not in indexes:
        op.create_index("ix_quality_batches_package_id", "quality_batches", ["package_id"])
    if "ix_quality_batches_assignee_id" not in indexes:
        op.create_index("ix_quality_batches_assignee_id", "quality_batches", ["assignee_id"])

    if "quality_samples" not in tables:
        op.create_table(
            "quality_samples",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("batch_id", sa.String(length=36), nullable=False),
            sa.Column("task_item_id", sa.String(length=36), nullable=False),
            sa.Column("sample_order", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["batch_id"], ["quality_batches.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["task_item_id"], ["task_items.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("batch_id", "task_item_id", name="uq_quality_sample_item"),
        )
    indexes = {index["name"] for index in inspector.get_indexes("quality_samples")}
    if "ix_quality_samples_batch_id" not in indexes:
        op.create_index("ix_quality_samples_batch_id", "quality_samples", ["batch_id"])
    if "ix_quality_samples_task_item_id" not in indexes:
        op.create_index("ix_quality_samples_task_item_id", "quality_samples", ["task_item_id"])

    columns = {column["name"] for column in inspector.get_columns("quality_checks")}
    missing = {
        "batch_id": sa.Column("batch_id", sa.String(length=36), nullable=True),
        "revision_id": sa.Column("revision_id", sa.String(length=36), nullable=True),
        "revision_version": sa.Column("revision_version", sa.Integer(), nullable=True),
        "revision_hash": sa.Column("revision_hash", sa.String(length=64), nullable=True),
    }
    if any(name not in columns for name in missing):
        with op.batch_alter_table("quality_checks", recreate="always") as batch_op:
            for name, column in missing.items():
                if name not in columns:
                    batch_op.add_column(column)
            batch_op.create_foreign_key(
                "fk_quality_checks_batch_id",
                "quality_batches",
                ["batch_id"],
                ["id"],
                ondelete="SET NULL",
            )
            batch_op.create_foreign_key(
                "fk_quality_checks_revision_id",
                "annotation_revisions",
                ["revision_id"],
                ["id"],
                ondelete="SET NULL",
            )
    indexes = {index["name"] for index in inspector.get_indexes("quality_checks")}
    if "ix_quality_checks_batch_id" not in indexes:
        op.create_index("ix_quality_checks_batch_id", "quality_checks", ["batch_id"])
    if "ix_quality_checks_revision_id" not in indexes:
        op.create_index("ix_quality_checks_revision_id", "quality_checks", ["revision_id"])

def downgrade() -> None:
    op.drop_index("ix_quality_checks_revision_id", table_name="quality_checks")
    op.drop_index("ix_quality_checks_batch_id", table_name="quality_checks")
    with op.batch_alter_table("quality_checks", recreate="always") as batch_op:
        batch_op.drop_column("revision_hash")
        batch_op.drop_column("revision_version")
        batch_op.drop_column("revision_id")
        batch_op.drop_column("batch_id")
    op.drop_index("ix_quality_samples_task_item_id", table_name="quality_samples")
    op.drop_index("ix_quality_samples_batch_id", table_name="quality_samples")
    op.drop_table("quality_samples")
    op.drop_index("ix_quality_batches_assignee_id", table_name="quality_batches")
    with op.batch_alter_table("quality_batches", recreate="always") as batch_op:
        batch_op.drop_column("assignee_id")
    op.drop_index("ix_quality_batches_package_id", table_name="quality_batches")
    op.drop_index("ix_quality_batches_project_id", table_name="quality_batches")
    op.drop_table("quality_batches")
