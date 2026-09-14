import type { Segment } from "../../../shared/api/types";
import type { WorkbenchAction, WorkbenchState } from "../types";
import { boundaryLimits } from "./timelineMath";
import { currentFineAnnotation, fineAnnotationText } from "./fineAnnotation";

function cloneSegments(segments: Segment[]) {
  return segments.map((segment) => ({ ...segment }));
}

export function createBlankSegment(length: number): Segment {
  return {
    id: "segment-1",
    start_frame: 0,
    end_frame: length,
    text: "",
    source: "user",
  };
}

function commit(state: WorkbenchState, segments: Segment[]): WorkbenchState {
  return {
    segments: cloneSegments(segments),
    past: [...state.past, cloneSegments(state.segments)],
    future: [],
    draftOrigin: undefined,
  };
}

const RETRY_RESET_KEYS = new Set([
  "initial_position",
  "initial_state",
  "approach",
  "reference",
  "orientation",
  "contact_point",
  "gripper_action",
  "pick_relative_object",
  "pick_grasped_object",
  "lift_action",
  "lift_gripper",
  "lift_destination",
  "position_end",
  "retreat",
]);

export function createWorkbenchState(segments: Segment[] = []): WorkbenchState {
  return { segments: cloneSegments(segments), past: [], future: [] };
}

export function segmentReducer(state: WorkbenchState, action: WorkbenchAction): WorkbenchState {
  switch (action.type) {
    case "begin-boundary":
      return { ...state, draftOrigin: cloneSegments(state.segments) };
    case "commit":
      return {
        segments: cloneSegments(state.segments),
        past: [...state.past, cloneSegments(state.draftOrigin || state.segments)],
        future: [],
        draftOrigin: undefined,
      };
    case "replace":
      return commit(state, action.segments);
    case "update-text":
      return commit(
        state,
        state.segments.map((segment) =>
          segment.id === action.id ? { ...segment, text: action.text } : segment,
        ),
      );
    case "update-fine":
      return commit(
        state,
        state.segments.map((segment) =>
          segment.id === action.id
            ? {
                ...segment,
                original_text: segment.original_text ?? segment.text,
                fine_annotation: action.fine_annotation,
                text: action.text,
                annotation_status: "in_progress",
              }
            : segment,
        ),
      );
    case "confirm":
      return commit(
        state,
        state.segments.map((segment) =>
          segment.id === action.id ? { ...segment, annotation_status: "confirmed" } : segment,
        ),
      );
    case "merge": {
      const index = state.segments.findIndex((segment) => segment.id === action.id);
      const adjacentIndex = index + (action.direction === "previous" ? -1 : 1);
      if (index < 0 || adjacentIndex < 0 || adjacentIndex >= state.segments.length) return state;
      const first = Math.min(index, adjacentIndex);
      const last = Math.max(index, adjacentIndex);
      return commit(state, [
        ...state.segments.slice(0, first),
        {
          ...state.segments[index],
          start_frame: state.segments[first].start_frame,
          end_frame: state.segments[last].end_frame,
          annotation_status: "in_progress",
        },
        ...state.segments.slice(last + 1),
      ]);
    }
    case "split": {
      const selected = state.segments.find((segment) => segment.id === action.id);
      if (!selected || action.frame <= selected.start_frame || action.frame >= selected.end_frame) {
        return state;
      }
      const next = state.segments.flatMap((segment) =>
        segment.id === selected.id
          ? [
              { ...selected, end_frame: action.frame },
              {
                ...selected,
                id: action.newId,
                start_frame: action.frame,
                text: "",
                source: "user",
              },
            ]
          : [segment],
      );
      return commit(state, next);
    }
    case "create-retry": {
      const selected = state.segments.find((segment) => segment.id === action.id);
      if (
        !selected ||
        action.frame < selected.start_frame ||
        action.frame >= selected.end_frame - 1
      )
        return state;
      const boundary = action.frame + 1;
      const fine = selected.fine_annotation ? currentFineAnnotation(selected) : undefined;
      const retryFine = fine
        ? {
            ...fine,
            outcome: "pending" as const,
            failure_reason: "",
            failure_reason_code: undefined,
            failure_direction: undefined,
            failure_detail: undefined,
            recovery_action: "",
            target_point_id: undefined,
            target_point_label: undefined,
            keyframe_point: undefined,
            keyframe_points: undefined,
            gripper_keyframes: undefined,
            template_values: Object.fromEntries(
              Object.entries(fine.template_values || {}).filter(
                ([key]) => !RETRY_RESET_KEYS.has(key),
              ),
            ),
          }
        : undefined;
      const retry: Segment = {
        id: action.newId,
        start_frame: boundary,
        end_frame: selected.end_frame,
        text: retryFine ? fineAnnotationText(retryFine) : "",
        source: "user",
        skill: selected.skill,
        attempt_group_id: selected.attempt_group_id || selected.id,
        retry_of: selected.id,
        fine_annotation: retryFine,
        annotation_status: "in_progress",
      };
      return commit(state, [
        ...state.segments.slice(0, state.segments.indexOf(selected)),
        { ...selected, end_frame: boundary, annotation_status: "in_progress" },
        retry,
        ...state.segments.slice(state.segments.indexOf(selected) + 1),
      ]);
    }
    case "move-boundary": {
      const limits = boundaryLimits(state.segments, action.index, action.length);
      const frame = Math.max(limits.min, Math.min(action.frame, limits.max));
      const next = cloneSegments(state.segments);
      if (!next[action.index - 1] || !next[action.index]) return state;
      next[action.index - 1].end_frame = frame;
      next[action.index].start_frame = frame;
      return {
        ...state,
        segments: next.map((segment) => ({ ...segment, annotation_status: "in_progress" })),
      };
    }
    case "clear":
      return commit(state, [createBlankSegment(action.length)]);
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        segments: cloneSegments(previous),
        past: state.past.slice(0, -1),
        future: [cloneSegments(state.segments), ...state.future],
        draftOrigin: undefined,
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        segments: cloneSegments(next),
        past: [...state.past, cloneSegments(state.segments)],
        future: state.future.slice(1),
        draftOrigin: undefined,
      };
    }
  }
}
