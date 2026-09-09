# Backend Instructions

- Keep `app/main.py` limited to FastAPI construction, middleware, and router registration.
- Organize HTTP and business code under `app/api`, `app/core`, `app/features`, and `app/infrastructure`.
- Routers parse requests, inject dependencies, call services, and choose response status codes.
- Services own authorization checks, state transitions, transactions, and audit writes.
- All task lifecycle transitions go through `work_items/state_machine.py`.
- All annotation revision files go through `infrastructure/annotation_storage.py`.
- SQLAlchemy models must not import FastAPI or Pydantic.
- Dataset parsing is isolated to the datasets import service.
- Preserve `/api/v1` paths and request/response compatibility during refactors.
- Use explicit types, Ruff formatting, and mypy-compatible code.
