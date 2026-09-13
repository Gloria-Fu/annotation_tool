# ADR 0005: Deduplicated effective video duration

## Status

Accepted

## Context

Task counts alone do not represent the amount of source data delivered. A
single episode can produce multiple assignment, submission, return, and review
events, and the same episode may appear in more than one task package.
Summing a duration for every event would overstate delivery volume.

## Decision

Expose effective video duration in project and work-statistics responses. The
duration of an episode is `length / dataset.fps`, with the existing workbench
fallback of 30 FPS when the imported dataset has no valid FPS.

For a personal or people statistic, collect the unique episodes represented by
that person's counted assignment, submission, return, or review events in the
requested range, then sum each episode duration once. Repeated annotation and
review events for the same episode therefore do not increase the duration.

For project progress statistics, effective duration is calculated from unique
episodes in completed task items. Per-person dashboard duration is also
deduplicated by episode, while the existing completed item count remains a
task-item count for backward-compatible display.

## Consequences

The duration measures deduplicated source-video coverage, not active editing
time. Within a selected personal-statistics range, each episode is assigned
to the first period containing that person's activity, so daily, weekly, or
monthly buckets do not multiply duration when later periods contain retries or
additional reviews. Detailed active time tracking remains out of scope.
