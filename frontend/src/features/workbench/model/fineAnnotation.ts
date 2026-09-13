import type { FineAnnotation } from "../../../shared/api/types";
import { getSkillDefinition, sentenceTokens } from "../skillDefinitions";
import { isSkillEnabled } from "../skillAvailability";
import type { Segment } from "../../../shared/api/types";
import { gripperIssues } from "./gripperKeyframes";
import { failureReasonLabel } from "../failureReasons";

export function currentFineAnnotation(segment: Segment): FineAnnotation {
  const fine = segment.fine_annotation;
  return {
    object_name: "",
    object_color: "",
    object_material: "",
    contact_point: "",
    position_start: "",
    position_end: "",
    outcome: fine?.outcome ?? (segment.source === "user" ? "pending" : "success"),
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
  const missing = [
    ...(fine.outcome === "pending" ? ["结果"] : []),
    ...(fine.outcome === "failure"
      ? []
      : sentenceTokens(skill, values).flatMap((token) =>
          typeof token !== "string" &&
          !token.optional &&
          (!values[token.key]?.trim() ||
            (token.options && !token.options.includes(values[token.key])))
            ? [token.label]
            : [],
        )),
  ];
  if (fine.outcome === "failure") {
    if (!fine.failure_reason_code) missing.push("失败原因");
    if (fine.failure_reason_code === "gripper_deviated" && !fine.failure_direction?.trim())
      missing.push("偏移方向");
    if (fine.failure_reason_code === "other" && !fine.failure_detail?.trim())
      missing.push("失败原因说明");
  }
  if (segment.retry_of && !fine.recovery_action?.trim()) missing.push("恢复动作");
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
  if (fine.outcome === "failure") {
    // Failure events can be submitted without an exact hand or jaw location.
  } else if (skill === "Pick" || skill === "Place") {
    missing.push(...gripperIssues(fine, segment.start_frame, segment.end_frame));
  } else if (!validPoint(fine.keyframe_point)) missing.push("片段内关键帧位置");
  return missing;
}

function tokenText(skill: string, values: Record<string, string>): string {
  return sentenceTokens(skill, values)
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
}

function retryText(fine: FineAnnotation): string {
  const recovery = fine.recovery_action?.trim();
  const target = fine.target_point_label?.trim();
  const pointId = fine.target_point_id?.trim();
  if (!recovery && !target) return "";
  const targetText = target ? `重新对准${target}${pointId ? `（${pointId}）` : ""}` : "";
  return ["失败后", recovery, targetText].filter(Boolean).join("，") + "。";
}

function failureText(fine: FineAnnotation): string {
  const reason = failureReasonLabel(
    fine.failure_reason_code,
    fine.failure_direction,
    fine.failure_detail,
  );
  const detail =
    fine.failure_reason_code && fine.failure_reason_code !== "other"
      ? fine.failure_detail?.trim()
      : "";
  return `本次尝试失败，原因是${reason}${detail ? `（${detail}）` : ""}。`;
}

export function fineAnnotationText(fine: FineAnnotation): string {
  const values = fine.template_values || {};
  if (!getSkillDefinition(fine.skill || "")) return "【请选择技能】";
  const outcome = fine.outcome || "pending";
  if (outcome === "failure") {
    return [failureText(fine), fine.notes].filter(Boolean).join(" ");
  }
  const sentence = tokenText(fine.skill || "", values);
  const retreat =
    fine.skill === "Place" && values.retreat?.trim()
      ? "随后夹爪移动至" + values.retreat.trim() + "。"
      : "";
  const status = outcome === "pending" ? "【请选择结果】" : "";
  return [retryText(fine), sentence + retreat, status, fine.notes].filter(Boolean).join(" ");
}
