import type { FineAnnotation } from "../../../shared/api/types";
import { getSkillDefinition, sentenceTokens } from "../skillDefinitions";
import { isSkillEnabled } from "../skillAvailability";
import type { Segment } from "../../../shared/api/types";
import { gripperIssues } from "./gripperKeyframes";

export function currentFineAnnotation(segment: Segment): FineAnnotation {
  const fine = segment.fine_annotation;
  return {
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
    ...fine,
    skill: fine?.skill || segment.skill || "",
    template_version: 1,
    template_values: fine?.template_values || {},
  };
}

export function templateIssues(segment: Segment): string[] {
  const fine = currentFineAnnotation(segment);
  const skill = fine.skill;
  if (skill && !isSkillEnabled(skill)) return ["Skill 暂未开放"];
  if (!skill) return ["技能"];
  const values = fine.template_values || {};
  const missing = sentenceTokens(skill, values).flatMap((token) =>
    typeof token !== "string" &&
    !token.optional &&
    (!values[token.key]?.trim() || (token.options && !token.options.includes(values[token.key])))
      ? [token.label]
      : [],
  );
  const validPoint = (point: FineAnnotation["keyframe_point"]) =>
    !(
      !point ||
      !Number.isInteger(point.frame) ||
      point.frame < segment.start_frame ||
      point.frame >= segment.end_frame ||
      !point.view ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.x > 1 ||
      point.y < 0 ||
      point.y > 1
    );
  if (skill === "Pick" || skill === "Place") {
    missing.push(...gripperIssues(fine, segment.start_frame, segment.end_frame));
  } else if (!validPoint(fine.keyframe_point)) missing.push("片段内关键帧位置");
  return missing;
}

export function fineAnnotationText(fine: FineAnnotation): string {
  const values = fine.template_values || {};
  if (!getSkillDefinition(fine.skill || "")) return "【请选择技能】";
  const sentence = sentenceTokens(fine.skill || "", values)
    .map((token) =>
      typeof token === "string"
        ? token
        : values[token.key]?.trim() && (!token.options || token.options.includes(values[token.key]))
          ? values[token.key].trim()
          : token.optional
            ? ""
            : "【" + token.label + "】",
    )
    .join("");
  const retreat =
    fine.skill === "Place" && values.retreat?.trim()
      ? "随后夹爪移动至" + values.retreat.trim() + "。"
      : "";
  return [sentence + retreat, fine.notes].filter(Boolean).join(" ");
}
