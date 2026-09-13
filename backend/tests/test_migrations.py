from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_empty_database_upgrades_to_head(tmp_path, monkeypatch):
    database_url = f"sqlite:///{tmp_path / 'migration.db'}"
    monkeypatch.setattr("app.config.settings.database_url", database_url)

    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    command.upgrade(config, "head")

    inspector = inspect(create_engine(database_url))
    tables = set(inspector.get_table_names())
    assert {
        "users",
        "projects",
        "project_members",
        "datasets",
        "import_jobs",
        "dataset_episodes",
        "task_packages",
        "task_package_members",
        "task_items",
        "annotation_revisions",
        "assignment_history",
        "quality_batches",
        "quality_samples",
        "quality_checks",
        "audit_logs",
    }.issubset(tables)
    assert {
        "id",
        "project_id",
        "package_id",
        "created_by_id",
        "assignee_id",
        "mode",
        "sample_percent",
        "sample_count",
        "seed",
        "only_unchecked",
        "status",
        "created_at",
        "completed_at",
    }.issubset({column["name"] for column in inspector.get_columns("quality_batches")})
    assert {
        "id",
        "batch_id",
        "task_item_id",
        "sample_order",
        "created_at",
    }.issubset({column["name"] for column in inspector.get_columns("quality_samples")})
    assert {
        "batch_id",
        "revision_id",
        "revision_version",
        "revision_hash",
    }.issubset({column["name"] for column in inspector.get_columns("quality_checks")})


def test_quality_traceability_migration_rolls_back_to_previous_revision(tmp_path, monkeypatch):
    database_url = f"sqlite:///{tmp_path / 'migration-rollback.db'}"
    monkeypatch.setattr("app.config.settings.database_url", database_url)

    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    command.downgrade(config, "0004")

    inspector = inspect(create_engine(database_url))
    tables = set(inspector.get_table_names())
    assert "quality_batches" not in tables
    assert "quality_samples" not in tables
    assert "quality_checks" in tables
    assert not {
        "batch_id",
        "revision_id",
        "revision_version",
        "revision_hash",
    }.intersection({column["name"] for column in inspector.get_columns("quality_checks")})
