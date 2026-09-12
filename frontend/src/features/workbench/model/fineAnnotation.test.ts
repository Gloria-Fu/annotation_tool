import { describe, expect, it, vi } from "vitest";
import type { FineAnnotation } from "../../../shared/api/types";
import { currentFineAnnotation, fineAnnotationText, templateIssues } from "./fineAnnotation";
import { SKILL_DEFINITIONS, sentenceTokens } from "../skillDefinitions";

vi.mock("../enabledSkills", () => ({
  ENABLED_SKILLS: ["Pick", "Place", "Grasp", "Push", "Pull"],
}));

const annotation: FineAnnotation = {
  skill: "Pick",
  operator_hand: "左手",
  object_name: "黄瓜",
  object_color: "绿色",
  object_material: "圆柱形水果",
  contact_point: "两侧",
  position_start: "货架的右边",
  position_end: "机械臂上",
  hand_state: "张开->闭合",
  outcome: "success",
  end_condition: "",
  actions: [],
  failure_reason: "",
  recovery: "",
  notes: "",
};

describe("fineAnnotationText", () => {
  it("shows current skill placeholders instead of legacy fields or imported text", () => {
    const segment = {
      id: "imported",
      start_frame: 0,
      end_frame: 10,
      text: "Retrieve cucumber from the shelf.",
      skill: "Pick",
    };
    const fine = currentFineAnnotation(segment);
    expect(fineAnnotationText(fine)).toContain("【操作手】夹爪初始位于【夹爪初始位置】");
    expect(fineAnnotationText(fine)).not.toContain(segment.text);
    expect(fineAnnotationText(annotation)).not.toContain("黄瓜");
    expect(templateIssues(segment)).toContain("操作手");
    expect(segment.text).toBe("Retrieve cucumber from the shelf.");
  });

  it("asks for a skill when there is no template", () => {
    expect(
      fineAnnotationText({
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
      }),
    ).toBe("【请选择技能】");
  });

  it("updates placeholders from current values and rejects invalid options", () => {
    const fine = {
      ...annotation,
      template_version: 1 as const,
      template_values: { operator_hand: "左手", object_name: "杯子", initial_state: "旧状态" },
    };
    const text = fineAnnotationText(fine);
    expect(text).toContain("左手夹爪");
    expect(text).toContain("杯子");
    expect(text).not.toContain("【物体名称】");
    expect(text).toContain("【初始夹爪状态】");
    expect(text).not.toContain("旧状态");
  });
});

it("only exposes the five supported skills with distinct outcomes", () => {
  expect(SKILL_DEFINITIONS.map((skill) => skill.name)).toEqual([
    "Pick",
    "Place",
    "Grasp",
    "Push",
    "Pull",
  ]);
  for (const skill of SKILL_DEFINITIONS) {
    const values: Record<string, string> = {};
    for (const token of skill.tokens)
      if (typeof token !== "string") values[token.key] = token.options?.[0] || token.example;
    const fine: FineAnnotation = {
      ...annotation,
      skill: skill.name,
      template_version: 1,
      template_values: values,
      keyframe_point: { frame: 5, view: "head", x: 0.5, y: 0.5 },
      keyframe_points: {
        left: { frame: 5, view: "head", x: 0.3, y: 0.5 },
        right: { frame: 5, view: "head", x: 0.7, y: 0.5 },
      },
      gripper_keyframes: {
        left: {
          frame: 5,
          view: "head",
          left: { visibility: "visible", x: 0.3, y: 0.5 },
          right: { visibility: "visible", x: 0.7, y: 0.5 },
        },
      },
    };
    const segment = {
      id: "one",
      start_frame: 0,
      end_frame: 10,
      text: fineAnnotationText(fine),
      fine_annotation: fine,
    };
    expect(templateIssues(segment)).toEqual([]);
    expect(segment.text).not.toContain("【");
    expect(templateIssues({ ...segment, end_frame: 5 })).toContain(
      skill.name === "Pick" || skill.name === "Place"
        ? "左手片段内 HEAD 关键帧"
        : "片段内关键帧位置",
    );
    delete values.orientation;
    expect(templateIssues(segment)).toContain("相对姿态");
  }
});

it("requires separate hand states and excludes hidden skill fields from text", () => {
  const tokens = sentenceTokens("Grasp", { operator_hand: "双手" });
  const keys = tokens.flatMap((token) => (typeof token === "string" ? [] : [token.key]));
  expect(keys).toContain("initial_state_left");
  expect(keys).toContain("gripper_action_right");
  expect(keys).not.toContain("position_end");
  expect(
    fineAnnotationText({
      ...annotation,
      skill: "Grasp",
      template_version: 1,
      template_values: { position_end: "不应出现的终点" },
    }),
  ).not.toContain("不应出现的终点");
});

it("ends Pick at holding and ignores obsolete movement fields", () => {
  const keys = sentenceTokens("Pick", {}).flatMap((token) =>
    typeof token === "string" ? [] : [token.key],
  );
  for (const key of ["approach", "support", "position_end"]) expect(keys).not.toContain(key);
  const text = fineAnnotationText({
    ...annotation,
    template_version: 1,
    template_values: { approach: "旧靠近位置", support: "旧支撑面", position_end: "旧终点" },
  });
  expect(text).toMatch(/夹持住物体。$/);
  expect(text).not.toContain("旧");
});

it("does not infer hand ownership from legacy Pick points", () => {
  const left = { frame: 5, view: "head", x: 0.3, y: 0.5 };
  const right = { ...left, x: 0.7 };
  const issues = (points?: FineAnnotation["keyframe_points"]) =>
    templateIssues({
      id: "one",
      start_frame: 0,
      end_frame: 10,
      text: "pick",
      fine_annotation: {
        ...annotation,
        template_version: 1,
        keyframe_point: left,
        keyframe_points: points,
      },
    });
  expect(issues()).toContain("左手关键帧标记");
  expect(issues({ left, right })).toContain("左手关键帧标记");
});
