import type { Segment } from "../../../shared/api/types";
import type { WorkbenchAction, WorkbenchState } from "../types";
import { boundaryLimits } from "./timelineMath";

function cloneSegments(segments: Segment[]) {
  return segments.map((segment) => ({ ...segment }));
}

function commit(state: WorkbenchState, segments: Segment[]): WorkbenchState {
  return {
    segments: cloneSegments(segments),
    past: [...state.past, cloneSegments(state.segments)],
    future: [],
    draftOrigin: undefined,
  };
}

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
    case "split": {
      const selected = state.segments.find((segment) => segment.id === action.id);
      if (
        !selected ||
        action.frame <= selected.start_frame ||
        action.frame >= selected.end_frame
      ) {
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
    case "move-boundary": {
      const limits = boundaryLimits(state.segments, action.index, action.length);
      const frame = Math.max(limits.min, Math.min(action.frame, limits.max));
      const next = cloneSegments(state.segments);
      if (!next[action.index - 1] || !next[action.index]) return state;
      next[action.index - 1].end_frame = frame;
      next[action.index].start_frame = frame;
      return { ...state, segments: next };
    }
    case "clear":
      return commit(state, []);
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
