import { describe, expect, it } from "vitest";
import type { Segment } from "../../../shared/api/types";
import { createWorkbenchState, segmentReducer } from "./segmentReducer";

const segments: Segment[] = [
  { id: "one", start_frame: 0, end_frame: 5, text: "pick" },
  { id: "two", start_frame: 5, end_frame: 10, text: "place" },
];

describe("segmentReducer", () => {
  it.each(["previous", "next"] as const)(
    "merges %s while retaining the selected annotation and supports undo",
    (direction) => {
      const selected = segments[direction === "previous" ? 1 : 0];
      const initial = createWorkbenchState(
        segments.map((segment) => ({ ...segment, annotation_status: "confirmed" })),
      );
      const merged = segmentReducer(initial, { type: "merge", id: selected.id, direction });
      expect(merged.segments).toEqual([
        { ...selected, start_frame: 0, end_frame: 10, annotation_status: "in_progress" },
      ]);
      expect(segmentReducer(merged, { type: "undo" }).segments).toEqual(initial.segments);
      expect(
        segmentReducer(segmentReducer(merged, { type: "undo" }), { type: "redo" }).segments,
      ).toEqual(merged.segments);
    },
  );

  it("ignores merge requests without an adjacent segment", () => {
    const initial = createWorkbenchState(segments);
    expect(segmentReducer(initial, { type: "merge", id: "one", direction: "previous" })).toBe(
      initial,
    );
    expect(segmentReducer(initial, { type: "merge", id: "two", direction: "next" })).toBe(initial);
  });

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

  it("creates a retry segment from the frame after a failure", () => {
    const failedFine = {
      skill: "Pick" as const,
      outcome: "failure" as const,
      template_version: 1 as const,
      template_values: {
        operator_hand: "右手",
        initial_position: "货架前侧",
        initial_state: "张开",
        object_location: "货架中央",
        object_name: "杯子",
        reference: "杯身",
        orientation: "平行",
        contact_point: "两侧",
        gripper_action: "闭合",
      },
      failure_reason_code: "gripper_closed_early" as const,
      object_name: "杯子",
      object_color: "",
      object_material: "",
      contact_point: "",
      position_start: "",
      position_end: "",
      end_condition: "",
      actions: [],
      failure_reason: "夹爪提前关闭",
      recovery: "",
      notes: "",
      gripper_keyframes: {
        right: {
          frame: 5,
          view: "head",
          left: { visibility: "invisible" as const },
          right: { visibility: "invisible" as const },
        },
      },
    };
    const initial = createWorkbenchState([
      {
        id: "failed",
        start_frame: 0,
        end_frame: 10,
        text: "失败",
        fine_annotation: failedFine,
        annotation_status: "confirmed",
      },
    ]);
    const next = segmentReducer(initial, {
      type: "create-retry",
      id: "failed",
      frame: 5,
      newId: "retry",
    });
    expect(next.segments).toHaveLength(2);
    expect(next.segments[0].end_frame).toBe(6);
    expect(next.segments[1]).toMatchObject({
      id: "retry",
      start_frame: 6,
      end_frame: 10,
      retry_of: "failed",
      attempt_group_id: "failed",
      annotation_status: "in_progress",
    });
    expect(next.segments[0].fine_annotation?.gripper_keyframes?.right?.frame).toBe(5);
    expect(next.segments[1].fine_annotation?.outcome).toBe("pending");
    expect(next.segments[1].fine_annotation?.gripper_keyframes).toBeUndefined();
    expect(next.segments[1].fine_annotation?.template_values?.initial_position).toBeUndefined();
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
