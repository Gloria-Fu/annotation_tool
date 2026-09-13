# Annotate Tool Architecture

## Runtime

The frontend is a React application served by Nginx. Nginx proxies `/api/*` to
the FastAPI service. FastAPI uses SQLAlchemy for durable workflow state,
Redis-backed HTTP sessions, and Celery for dataset imports.

Datasets are mounted read-only from the application's point of view. Import
inspection reads LeRobot v2.1 metadata and records episode references in the
database. Annotation revisions are the only files written below a dataset,
under `annotations/<task_item_id>/`.

## Backend Boundaries

- `app/api`: versioned router assembly.
- `app/core`: configuration, authentication, permissions, errors, and audit helpers.
- `app/features`: feature-owned routers, schemas, services, and workflow rules.
- `app/infrastructure`: database and annotation file storage adapters.
- `app/models`: SQLAlchemy persistence models and framework-neutral enums.

Routers are deliberately thin. Services own transaction boundaries and call
the task state machine for lifecycle changes. Annotation files are written
only through `AnnotationStorage`.

## Frontend Boundaries

- `app`: providers, shell, and route assembly.
- `shared`: HTTP client, generated OpenAPI types, labels, query keys, and small UI primitives.
- `features`: pages and feature-local API adapters.
- `features/workbench/model`: pure segment operations.
- `features/workbench/hooks`: video synchronization and autosave behavior.
- `features/workbench/components`: presentation-only workbench pieces.

The workbench does not leak internal components into platform pages. Timeline
components emit events and never request data themselves.

## Compatibility

The public API remains under `/api/v1`. Existing payloads and response shapes
are treated as compatibility contracts. Structural changes should therefore
move implementation behind the existing route surface rather than introduce
parallel endpoints.

Historical work reporting adds `/api/v1/work-statistics/me`,
`/api/v1/work-statistics/people`, and matching CSV endpoints without changing
existing routes or payloads. The personal endpoint is available to signed-in
users. The people endpoint is limited to developer administrators and
annotation managers, with project access enforced by the existing permission
service. OpenAPI JSON, generated TypeScript types, and contract tests are
updated together whenever these endpoints change.

Quality traceability adds persisted quality batches and samples, plus quality
history endpoints. Batch checks record the inspected annotation revision and
file hash. Quality inspection is limited to developer administrators and
annotation managers; reviewers use the review task flow and can choose
sequential or random claim order when taking the next review task. The legacy
item-level quality endpoint remains available for compatibility, while the
quality page uses batch-scoped checks.

## Verification

`make check` is the repository gate for formatting, linting, type checking,
tests, OpenAPI generation consistency, and the frontend production build.
Playwright end-to-end tests run through `make e2e`.
