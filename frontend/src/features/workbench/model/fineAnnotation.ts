import type { FineAnnotation } from "../../../shared/api/types";
import { getSkillDefinition, sentenceTokens } from "../skillDefinitions";
import { isSkillEnabled } from "../skillAvailability";
import type { Segment } from "../../../shared/api/types";
import { gripperIssues } from "./gripperKeyframes";

export function templateIssues(segment: Segment): string[] {
  const fine = segment.fine_annotation;
  const skill = fine?.skill || segment.skill;
  if (skill && !isSkillEnabled(skill)) return ["Skill 暂未开放"];
  if (fine?.template_version !== 1) return [];
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
  if (skill === "Pick") {
    missing.push(...gripperIssues(fine, segment.start_frame, segment.end_frame));
  } else if (!validPoint(fine.keyframe_point)) missing.push("片段内关键帧位置");
  return missing;
}

export function fineAnnotationText(fine: FineAnnotation, fallback: string): string {
  if (fine.template_version === 1) {
    const values = fine.template_values || {};
    if (!getSkillDefinition(fine.skill || "")) return fallback;
    const sentence = sentenceTokens(fine.skill || "", values)
      .map((token) =>
        typeof token === "string"
          ? token
          : values[token.key]?.trim() || (token.optional ? "" : "【" + token.label + "】"),
      )
      .join("");
    const retreat =
      fine.skill === "Place" && values.retreat?.trim()
        ? "随后夹爪移动至" + values.retreat.trim() + "。"
        : "";
    return [sentence + retreat, fine.notes].filter(Boolean).join(" ");
  }
  const subject = [fine.operator_hand, getSkillDefinition(fine.skill || "")?.label]
    .filter(Boolean)
    .join(" ");
  const attributes = [
    fine.object_color && `颜色：${fine.object_color}`,
    fine.object_material && `材质：${fine.object_material}`,
  ].filter(Boolean);
  const object = `${attributes.length ? `【${attributes.join("，")}】` : ""}${fine.object_name}`;
  const movement =
    fine.position_start || fine.position_end
      ? `从${fine.position_start || "未填写位置"}到${fine.position_end || "未填写位置"}`
      : "";
  const details = [
    fine.hand_state && `手部状态为${fine.hand_state}`,
    fine.contact_point && `接触点在${fine.contact_point}`,
  ].filter(Boolean);
  const sentence = [[subject, object].filter(Boolean).join(" "), movement, ...details]
    .filter(Boolean)
    .join("，");
  const withPunctuation = sentence ? `${sentence}。` : "";
  return [withPunctuation, fine.notes].filter(Boolean).join(" ") || fallback;
}
