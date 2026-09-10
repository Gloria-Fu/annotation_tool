# ADR 0002: Skill sentence templates

Status: Accepted

Five initial skills use feature-owned declarative sentence tokens and field definitions.
The same tokens render labelled inputs and generate segment text. This prevents the editor
and saved sentence from drifting apart. Domain rules are in ../annotation-rules.md.
New optional fine_annotation.template_values and template_version fields preserve the
segments.v1 HTTP contract. Existing payload fields remain intact; no database migration is needed.
UI validation applies to version 1 templates. The backend continues generic segment validation;
clients outside this UI are not guaranteed to enforce template completeness.

Template lookup and rendering are independent of availability. enabledSkills.ts owns the
frontend allowlist; skillAvailability.ts derives options and edit/submit guards from it.
Disabling a skill does not remove its definition or historical data. This is a frontend
availability setting, not backend authorization.

Pick now ends at gripper closure holding the object, without requiring lift or transport.
Its landmarks are stored in gripper_keyframes.left/right, keyed by operator hand. Each group
owns its frame/view and left/right jaw marks. Visible marks have visibility="visible" and
normalized x/y; invisible marks have visibility="invisible" without coordinates. Both jaws
must be resolved, but the two hands may use different HEAD frames within one Pick segment.
Single-hand input has one entry; both-hand input has two independent entries. Confirm only
replaces the active hand group. Switching hands never reassigns ownership and retains inactive
groups. Legacy keyframe_point/keyframe_points remain intact but need explicit reannotation
because their hand ownership is ambiguous. Other skills retain single-point behavior.
The generic JSON OpenAPI envelope is unchanged; no database migration is required.

Pick landmark editing uses a modal with a native-resolution HEAD frame snapshot. The frame
is captured only after decoding/seeking completes. react-zoom-pan-pinch owns viewport
zoom/pan; landmark coordinates are normalized against the transformed image rectangle.
Edits stay local until both jaws of the selected hand are resolved together; cancel leaves
saved data intact. Only the active hand group matching the captured frame and HEAD view is
loaded. Invisibility is explicit, never a fabricated coordinate or an inferred missing point.
