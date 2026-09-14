# ADR 0010: Task Package Group Authorization

## Status

Accepted

## Context

Task packages previously inherited access from project membership. The platform
now needs to give external teams access to selected packages without exposing
the rest of a project or requiring one-by-one user assignments.

## Decision

Add a many-to-many authorization relation between task packages and global user
groups. A package has an explicit `group_access_configured` flag:

- `false`: legacy behavior; published work is available to project members
  according to their role.
- `true`: work is available to members of the groups authorized on that
  package. Developer administrators and project annotation managers retain
  management access through their existing project permissions.

Adding the first group sets the flag to `true`. Removing groups never resets
the flag. Therefore, removing the last group intentionally leaves the package
closed to annotators and reviewers until a group is authorized again.

The package list and project selector expose only projects containing a
published package the current user can access. Task item detail, data, media,
draft, submit, review, and clear operations all use the same package access
check.

## Consequences

- Existing task packages continue working without data migration or manual
  reassignment.
- External users can access authorized packages without becoming project
  members.
- A package can be made inaccessible to workers by removing its final group,
  without accidentally falling back to the broader project audience.
- Project managers still need project membership to create, publish, assign,
  reclaim, or change package authorization.
- A group that is still referenced by a task package cannot be deleted; its
  package authorizations must be removed first.
