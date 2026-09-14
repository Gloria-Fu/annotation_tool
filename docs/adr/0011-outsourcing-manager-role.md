# ADR 0011: Outsourcing Manager Role

## Status

Accepted

## Context

External delivery teams need a responsible account that can manage their
annotators and reviewers and follow their progress without gaining access to
the internal project, dataset, or task-package administration surfaces.

## Decision

Add `outsourcing_manager` as a distinct role. Its authorization boundary is
the user groups assigned to that manager:

- The manager can create, view, activate, deactivate, reset, and delete
  annotator and reviewer accounts in the groups they manage.
- New accounts created by the manager must belong to at least one of their
  managed groups.
- The manager can view work statistics only for members of those groups.
- The manager can view packages authorized to those groups and read the task
  items, annotation context, data, and media within those packages.
- Task detail views are read-only for the manager.
- The manager cannot create projects or datasets, publish or administer task
  packages, change package authorization, assign or reclaim tasks, perform
  quality checks, or create higher-privilege accounts.

Existing project membership and legacy package access remain unchanged. A
package with explicit group authorization is visible to workers and managers
through the authorized groups; a package without that flag keeps its legacy
project-member behavior.

## Consequences

- Internal project information stays outside the external manager's scope.
- Group ownership changes take effect immediately for package and statistics
  access.
- The external manager can inspect annotation outcomes and media without
  receiving mutation controls.
- Developer administrators remain responsible for creating external manager
  accounts and assigning them to groups.
