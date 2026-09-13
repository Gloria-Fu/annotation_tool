# ADR 0006: Persisted Quality Sampling Traceability

## Decision

Quality inspection is represented by a persisted batch, persisted sample rows,
and immutable check records. A check records the sampled task, operator, result,
reason, and the annotation revision version and file hash inspected at that
moment.

The task's current `qa_status` remains a workflow summary only. Historical
quality decisions are read from `QualityCheck`, while a rejected task is reset
to `unchecked` when its corrected annotation is submitted for review.

## Consequences

- Refreshing the browser or changing operators does not lose a sampling list.
- A batch can be audited independently of the task's current state.
- Rework creates a new reviewable annotation revision and a later batch can
  perform a new quality check.
- Quality inspection is limited to developer administrators and annotation
  managers; reviewers only use the review task flow.
- Existing quality-check calls remain compatible; calls without a batch are
  retained as legacy checks but are not included in a persisted batch.

## Rollback Notes

Migration `0005` can be rolled back before deployment of the new UI. Rolling it
back drops quality batch/sample tables and the optional batch/revision columns
on `quality_checks`; existing legacy quality result rows remain otherwise
unchanged. Rollback loses the newly captured batch and revision traceability.
