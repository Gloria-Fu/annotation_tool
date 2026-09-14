# ADR 0008: Project-scoped task package access

## Status

Accepted

## Context

Task package membership was stored separately from project membership and could
only be set while creating a package. There was no supported way to add a new
reviewer to an existing package, which could make published work unavailable
to otherwise authorized project members.

## Decision

Project membership is the source of truth for task package visibility and
claim authorization. Annotators and reviewers who belong to a project can see
its published task packages and use the applicable claim flow. Item-level
assignment remains available for managers who need to route particular items.

The `member_ids` request field is retained as a deprecated compatibility field
for older clients, but it no longer creates or enforces package restrictions.
The existing `task_package_members` table is left in place for safe rollout and
historical data compatibility; application authorization no longer reads it.

## Consequences

Adding a user to a project automatically grants access to all published task
packages in that project. Removing a user from the project removes that access
through the existing project authorization checks. Projects must therefore be
kept up to date when access needs to change.

Package-specific distribution is no longer available. If that becomes a
requirement later, it should be introduced as a separate, explicitly managed
assignment policy rather than restoring an implicit second membership list.
