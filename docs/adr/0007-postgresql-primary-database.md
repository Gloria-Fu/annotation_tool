# ADR 0007: PostgreSQL as the primary service database

## Status

Accepted

## Context

The service originally used SQLite for the remote CCI deployment. SQLite is
simple for a single process, but concurrent task claims, annotation saves,
reviews, audits, and report queries can contend on one database file. It also
prevents safely running multiple API replicas.

The repository already includes PostgreSQL support in `docker-compose.yml` and
the `psycopg` dependency. The remote deployment therefore moves the primary
service database to PostgreSQL while keeping SQLite as a local test fallback.

## Decision

Production and CCI deployments use PostgreSQL through `DATABASE_URL`. Local
tests may continue to use SQLite through the test fixture's explicit database
URL. Redis remains the shared session and Celery broker.

Existing SQLite data is copied with
`backend/scripts/migrate_sqlite_to_postgres.py`. The script requires an
initialized Alembic schema, copies tables in SQLAlchemy dependency order, and
verifies row counts and deterministic row digests after the copy.

The old SQLite file remains as a read-only rollback backup until the
PostgreSQL deployment has been accepted. Rolling back consists of stopping the
API and worker, restoring `DATABASE_URL` to the SQLite file, and starting the
previous process configuration. New writes made after cutover must be replayed
manually if a rollback is required.

## Consequences

- Concurrent API and worker writes use PostgreSQL locking and connection
  pooling.
- Multiple API replicas can share the same database.
- PostgreSQL must be backed up and monitored as a service dependency.
- SQLite remains useful for fast unit tests, but is no longer the remote
  production database.
