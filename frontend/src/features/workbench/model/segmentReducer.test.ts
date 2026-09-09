import { describe, expect, it } from "vitest";
import type { Segment } from "../../../shared/api/types";
import { createWorkbenchState, segmentReducer } from "./segmentReducer";

const segments: Segment[] = [
  { id: "one", start_frame: 0, end_frame: 5, text: "pick" },
  { id: "two", start_frame: 5, end_frame: 10, text: "place" },
];

describe("segmentReducer", () => {
  it("splits a segment and selects no server state", () => {
    const state = segmentReducer(createWorkbenchState(segments), {
      type: "split",
      id: "one",
      frame: 3,
      newId: "one-split",
    });
    expect(state.segments).toEqual([
      { id: "one", start_frame: 0, end_frame: 3, text: "pick" },
      { id: "one-split", start_frame: 3, end_frame: 5, text: "", source: "user" },
      segments[1],
    ]);
  });

  it("moves an adjacent boundary without creating overlap", () => {
    const state = segmentReducer(createWorkbenchState(segments), {
      type: "move-boundary",
      index: 1,
      frame: 7,
      length: 10,
    });
    expect(state.segments[0].end_frame).toBe(7);
    expect(state.segments[1].start_frame).toBe(7);
    expect(state.past).toHaveLength(0);
  });

  it("supports clear, undo, and redo", () => {
    const initial = createWorkbenchState(segments);
    const cleared = segmentReducer(initial, { type: "clear", length: 10 });
    expect(cleared.segments).toEqual([
      { id: "segment-1", start_frame: 0, end_frame: 10, text: "", source: "user" },
    ]);
    const undone = segmentReducer(cleared, { type: "undo" });
    expect(undone.segments).toEqual(segments);
    const redone = segmentReducer(undone, { type: "redo" });
    expect(redone.segments).toEqual(cleared.segments);
  });
});
