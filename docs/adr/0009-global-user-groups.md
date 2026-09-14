# ADR 0009: Global User Groups

## Status

Accepted

## Context

Project membership currently controls access to project-scoped work. The platform
also needs to organize internal and external personnel before task-package
permissions are introduced. A group should describe an organizational cohort
without changing project or task-package access by itself.

## Decision

Add global user groups and a many-to-many user membership relation. Groups are
managed by developer administrators in this phase. Group membership is
independent of project membership and does not grant access to any project or
dataset by itself. Task-package authorization is defined separately in ADR
0010.

Groups must be empty before deletion so future task-package references can be
added without silently deleting authorization history.

## Consequences

- Internal and external accounts can be organized without creating duplicate
  projects or datasets.
- Existing project and task-package permissions remain unchanged.
- Task-package authorization can bind a package to a group instead of
  selecting users individually.
- The initial UI intentionally limits group administration to developer
  administrators; the external-lead role can later receive scoped group
  management.
