# ADR 0001: Feature-Owned Boundaries

## Status

Accepted

## Context

The initial MVP placed all FastAPI handlers and React pages in two large
files. That made it difficult to change one workflow without loading unrelated
account, dataset, or workbench behavior into the same review.

## Decision

Organize both applications by business feature. Keep HTTP adapters, domain
services, persistence models, and UI components in explicit ownership
boundaries. Use a shared task state machine for lifecycle transitions and a
single annotation storage adapter for revision files.

## Consequences

Feature changes become easier to locate and test. The repository contains more
files, but each file has a narrower responsibility. Compatibility is preserved
by retaining the existing `/api/v1` route surface while moving implementation
behind it.
