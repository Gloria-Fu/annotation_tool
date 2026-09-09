# Repository Instructions

## Working Rules

- Before changing code, read this file and the `AGENTS.md` in the target directory.
- Keep behavior changes separate from structural refactors and keep each phase in its own commit.
- Do not add business implementation to `frontend/src/App.tsx` or `backend/app/main.py`.
- New behavior belongs under the matching `features/<feature>` directory.
- Route handlers only adapt HTTP input and output. Business rules belong in services or state machines.
- Do not bypass permission services, the task state machine, or `AnnotationStorage`.
- Never modify LeRobot source metadata, Parquet files, or videos.
- Do not use `any` to silence a type error.
- A database change requires a migration, upgrade coverage, and rollback notes.
- Do not delete or overwrite existing uncommitted user changes.
- Public API changes require updated OpenAPI types, compatibility notes, and contract tests.
- Before delivery, run `make check`; report checks that cannot run.
- Every delivery must list changed files, behavior changes, test results, and remaining risks.
- Architecture decisions belong in `docs/adr/`, not only in conversation.

## Child-Agent Context

- Child agents do not inherit the full conversation by default.
- Handoffs contain only the concrete task, target files, relevant diff summary, acceptance criteria, and necessary constraints.
- Child agents read the shared workspace directly and must not receive copied full diffs or long logs.
