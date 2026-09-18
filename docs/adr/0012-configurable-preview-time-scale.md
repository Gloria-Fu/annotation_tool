# 0012 Configurable Preview Time Scale

## Status

Accepted

## Context

Annotation video playback is intentionally accelerated for operator-facing workflows while preserving
source frame numbers, dataset metadata, and saved annotation payloads. Work statistics must follow the
operator-facing time scale for annotators, reviewers, annotation managers, and outsourcing managers, while
developer administrators still need access to source-duration values for debugging and dataset validation.

## Decision

Use `ANNOTATION_PREVIEW_SPEED_FACTOR` as the single backend configuration source for preview acceleration.
The default is `1.3`.

Backend report APIs expose both source and operator-facing duration fields:

- `raw_effective_video_seconds` is the source-duration value derived from source frame count and fps.
- `display_effective_video_seconds` is `raw_effective_video_seconds / ANNOTATION_PREVIEW_SPEED_FACTOR`.
- `effective_video_seconds` remains for compatibility and returns the viewer-visible duration: raw for
  `developer_admin`, display for all other roles.

Workbench context includes the configured preview speed factor so the frontend can apply the same hidden
playback baseline and display-time scale. Saved frames, segment boundaries, revision payloads, source
metadata, Parquet files, and videos remain unchanged.

## Consequences

Developer administrators see both display and raw durations in reports. Other roles see only display
durations. CSV exports follow the same visibility rule, so external-facing users do not receive raw-duration
columns.
