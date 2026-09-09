from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_empty_database_upgrades_to_head(tmp_path, monkeypatch):
    database_url = f"sqlite:///{tmp_path / 'migration.db'}"
    monkeypatch.setattr("app.config.settings.database_url", database_url)

    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    command.upgrade(config, "head")

    tables = set(inspect(create_engine(database_url)).get_table_names())
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
        "quality_checks",
        "audit_logs",
    }.issubset(tables)
