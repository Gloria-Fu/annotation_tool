"""Copy an Annotate Tool SQLite database into an initialized PostgreSQL database."""

from __future__ import annotations

import argparse
import json
from collections.abc import Iterable
from datetime import UTC, date, datetime, time
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.engine import Connection, Engine

from app.database import Base
from app import models  # noqa: F401


def _json_value(value: Any) -> Any:
    if isinstance(value, datetime):
        normalized = value if value.tzinfo else value.replace(tzinfo=UTC)
        return normalized.astimezone(UTC).isoformat()
    if isinstance(value, (date, time)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in sorted(value.items())}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    return value


def _row_digest(rows: Iterable[dict[str, Any]]) -> str:
    import hashlib

    payload = json.dumps(
        [_json_value(row) for row in rows],
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _table_rows(connection: Connection, table_name: str) -> list[dict[str, Any]]:
    table = Base.metadata.tables[table_name]
    return [
        dict(row)
        for row in connection.execute(select(table).order_by(*table.primary_key.columns)).mappings()
    ]


def _verify_tables(source: Engine, target: Engine, table_names: list[str]) -> None:
    with source.connect() as source_connection, target.connect() as target_connection:
        for table_name in table_names:
            source_rows = _table_rows(source_connection, table_name)
            target_rows = _table_rows(target_connection, table_name)
            if len(source_rows) != len(target_rows):
                raise RuntimeError(
                    f"{table_name}: row count differs "
                    f"(source={len(source_rows)}, target={len(target_rows)})"
                )
            if _row_digest(source_rows) != _row_digest(target_rows):
                raise RuntimeError(f"{table_name}: copied rows differ")


def _target_has_application_rows(connection: Connection, table_names: list[str]) -> bool:
    return any(
        connection.execute(text(f'SELECT 1 FROM "{table_name}" LIMIT 1')).first() is not None
        for table_name in table_names
    )


def migrate(source_url: str, target_url: str, allow_nonempty: bool = False) -> None:
    source = create_engine(source_url, pool_pre_ping=True)
    target = create_engine(target_url, pool_pre_ping=True)
    table_names = [table.name for table in Base.metadata.sorted_tables]

    if "alembic_version" not in inspect(target).get_table_names():
        raise RuntimeError(
            "target database has no Alembic schema; run `alembic upgrade head` first"
        )

    with target.begin() as target_connection:
        if not allow_nonempty and _target_has_application_rows(target_connection, table_names):
            raise RuntimeError(
                "target database is not empty; pass --allow-nonempty only for an intentional merge"
            )

        with source.connect() as source_connection:
            for table_name in table_names:
                table = Base.metadata.tables[table_name]
                rows = _table_rows(source_connection, table_name)
                if rows:
                    target_connection.execute(table.insert(), rows)

    _verify_tables(source, target, table_names)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="SQLite SQLAlchemy URL")
    parser.add_argument("--target", required=True, help="PostgreSQL SQLAlchemy URL")
    parser.add_argument(
        "--allow-nonempty",
        action="store_true",
        help="allow copying into a target that already contains application rows",
    )
    args = parser.parse_args()
    migrate(args.source, args.target, allow_nonempty=args.allow_nonempty)
    print("SQLite to PostgreSQL migration completed and verified.")


if __name__ == "__main__":
    main()
