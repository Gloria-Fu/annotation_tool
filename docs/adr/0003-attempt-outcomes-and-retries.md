# ADR 0003: Attempt outcomes and retries

Status: Accepted

Pick and Place describe individual attempts. An attempt can be pending, successful, or
failed. Failure data is structured in `fine_annotation` with a reason code, an optional
direction, and optional detail. The generated sentence uses failure-specific tokens so a
failed attempt never claims that the object was successfully picked or placed.

Failure attempts use an event panel rather than a success sentence template. The panel
requires a structured reason, conditionally requires a deviation direction or an
explanation for `other`, and provides optional free text for the post-failure state. Setup,
contact, approach, placement, release, and exact failure-keyframe fields are not required
because those facts may be missing or invalid after an error.

When an attempt fails and the robot retries, the workbench creates a separate segment
starting on the frame after the failure frame. The retry keeps the Skill and stable object
context, clears attempt-specific keyframes and outcome data, and stores `retry_of` and
`attempt_group_id` on the segment. Recovery action and optional target point fields belong
to the retry's `fine_annotation`.

This remains a client-side annotation model inside the existing generic `segments.v1`
payload. No database migration or backend route change is required. Legacy annotations
without an explicit outcome retain success-compatible rendering unless they are newly
created user segments, which start as pending.
