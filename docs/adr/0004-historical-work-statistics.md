# ADR 0004: Historical work statistics

## Status

Accepted

## Context

Task status only describes the latest state of an item. It cannot answer how
many items a person claimed, submitted, returned, or reviewed during a
particular day, week, or month. The application already records lifecycle
events in `AssignmentHistory`, submitted revisions in `AnnotationRevision`,
and review decisions in `AuditLog`.

## Decision

Add work-statistics endpoints under the reports feature. Personal statistics
are scoped to the signed-in user. People statistics are restricted to
developer administrators and annotation managers, with the latter limited to
their project memberships.

Metrics are calculated from historical event timestamps rather than current
task status. The first submission for an item is identified from submitted
annotation revisions; later submitted revisions are resubmissions. A return
is a review `request_changes` event addressed to the annotator. First-pass
and rework rates are classified from the first review decision after the first
submission. Annotation duration pairs a first submission with the latest
annotation claim or assignment before it. Review duration pairs a review
decision with the latest submitted revision before that decision.

The API supports daily, weekly, and monthly personal buckets, date-range
people summaries, and CSV exports. No schema migration is required because
the implementation reuses existing immutable history tables.

Task queues reuse `GET /api/v1/my-tasks`. The existing default remains the
pending work queue when `view` is omitted or set to `pending`; `view=history`
adds a read-only list of tasks on which the signed-in user has submitted
annotation or completed a review. The response shape and route remain
unchanged, so existing clients continue to receive the pending queue.

## Consequences

Historical results remain available after a task is reassigned or completed,
and personal/admin views use the same calculation path as CSV exports. Large
projects may eventually need pre-aggregated reporting tables or background
aggregation; the initial implementation favors correctness and reuse of the
existing history data.
