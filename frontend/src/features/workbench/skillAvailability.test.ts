import { describe, expect, it, vi } from "vitest";
import { SKILL_OPTIONS, isSkillEnabled } from "./skillAvailability";
import { getSkillDefinition } from "./skillDefinitions";
import { fineAnnotationText, templateIssues } from "./model/fineAnnotation";
import type { FineAnnotation } from "../../shared/api/types";

vi.mock("./enabledSkills", () => ({ ENABLED_SKILLS: ["Pull", "Pick"] }));

describe("skill availability", () => {
  it("limits options to the allowlist and preserves its order", () => {
    expect(SKILL_OPTIONS.map((option) => option.value)).toEqual(["Pull", "Pick"]);
    expect(isSkillEnabled("Pick")).toBe(true);
    expect(isSkillEnabled("Grasp")).toBe(false);
    expect(isSkillEnabled("Unknown")).toBe(false);
  });

  it("retains disabled templates and text rendering while blocking submission", () => {
    expect(getSkillDefinition("Grasp")?.tokens.length).toBeGreaterThan(0);
    const fine: FineAnnotation = {
      skill: "Grasp",
      template_version: 1,
      template_values: { object_name: "黄瓜" },
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
    };
    expect(fineAnnotationText(fine, "")).toContain("黄瓜");
    expect(fineAnnotationText(fine, "")).toContain("形成稳定抓握");
    expect(
      templateIssues({
        id: "one",
        start_frame: 0,
        end_frame: 10,
        text: "历史标注",
        fine_annotation: fine,
      }),
    ).toEqual(["Skill 暂未开放"]);
  });
});
