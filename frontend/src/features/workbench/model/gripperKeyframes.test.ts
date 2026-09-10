import { describe, expect, it } from "vitest";
import type { FineAnnotation, GripperKeyframe } from "../../../shared/api/types";
import { annotationHands, completeGripper, gripperIssues } from "./gripperKeyframes";

const group: GripperKeyframe = {
  frame: 5,
  view: "head",
  left: { visibility: "visible", x: 0.3, y: 0.5 },
  right: { visibility: "invisible" },
};
const fine: FineAnnotation = {
  object_name: "",
  object_color: "",
  object_material: "",
  contact_point: "",
  position_start: "",
  position_end: "",
  outcome: "success",
  end_condition: "",
  actions: [],
  failure_reason: "",
  recovery: "",
  notes: "",
  template_values: { operator_hand: "双手" },
  gripper_keyframes: { left: group, right: { ...group, frame: 8 } },
};
describe("hand-scoped gripper keyframes", () => {
  it("allows different frames for two hands and only validates active hands", () => {
    expect(gripperIssues(fine, 0, 10)).toEqual([]);
    expect(
      gripperIssues({ ...fine, gripper_keyframes: { left: group, right: group } }, 0, 10),
    ).toEqual([]);
    expect(gripperIssues({ ...fine, gripper_keyframes: { left: group } }, 0, 10)).toEqual([
      "右手关键帧标记",
    ]);
    const single = {
      ...fine,
      template_values: { operator_hand: "左手" },
      gripper_keyframes: { left: group },
    };
    expect(annotationHands(single)).toEqual(["left"]);
    expect(gripperIssues(single, 0, 10)).toEqual([]);
    expect(gripperIssues({ ...single, template_values: { operator_hand: "右手" } }, 0, 10)).toEqual(
      ["右手关键帧标记"],
    );
  });
  it("requires both jaws, permitting explicit invisibility without coordinates", () => {
    expect(completeGripper(group)).toBe(true);
    expect(completeGripper({ ...group, left: { visibility: "invisible" } })).toBe(true);
    expect(completeGripper({ ...group, right: undefined })).toBe(false);
    expect(completeGripper({ ...group, right: group.left })).toBe(false);
    expect(completeGripper({ ...group, left: { visibility: "visible", x: NaN, y: 0 } })).toBe(
      false,
    );
    expect(completeGripper({ ...group, left: { visibility: "visible", x: 1.1, y: 0 } })).toBe(
      false,
    );
  });
  it("enforces per-hand frame range and HEAD view", () => {
    expect(gripperIssues(fine, 0, 8)).toContain("右手片段内 HEAD 关键帧");
    expect(
      gripperIssues({ ...fine, gripper_keyframes: { left: { ...group, view: "wrist" } } }, 0, 10),
    ).toContain("左手片段内 HEAD 关键帧");
  });
});
