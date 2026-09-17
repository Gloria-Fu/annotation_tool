import type { FineAnnotation, SegmentValidity } from "../../../shared/api/types";
import {
  getSkillDefinition,
  sentenceFieldValue,
  sentenceTokens,
  sentenceTokensForOutput,
  withSkillTemplateDefaults,
} from "../skillDefinitions";
import { isSkillEnabled } from "../skillAvailability";
import type { Segment } from "../../../shared/api/types";
import { annotationHands, handLabel } from "./gripperKeyframes";
import { failureReasonLabel } from "../failureReasons";
import { invalidSegmentReasonLabel } from "../segmentValidity";

export type FineAnnotationPreviewPart = {
  text: string;
  kind: "plain" | "filled" | "missing";
};

export function placeKeyframeFrame(
  fine: FineAnnotation,
  hand?: "left" | "right",
): number | undefined {
  if (hand) return fine.gripper_keyframes?.[hand]?.frame;
  if (fine.keyframe_frame !== undefined) return fine.keyframe_frame;
  return Object.values(fine.gripper_keyframes || {}).find((group) => Number.isInteger(group?.frame))
    ?.frame;
}

function validKeyframeFrame(frame: number | undefined, start: number, end: number) {
  return typeof frame === "number" && Number.isInteger(frame) && frame >= start && frame < end;
}

function keyframeFrameIssues(fine: FineAnnotation, start: number, end: number): string[] {
  const hands = annotationHands(fine);
  if (hands.length > 1) {
    return hands.flatMap((hand) =>
      validKeyframeFrame(placeKeyframeFrame(fine, hand), start, end)
        ? []
        : [handLabel(hand) + "片段内关键帧帧号"],
    );
  }
  return validKeyframeFrame(placeKeyframeFrame(fine), start, end) ? [] : ["片段内关键帧帧号"];
}

function effectiveSegmentValidity(fine: FineAnnotation): SegmentValidity {
  return fine.segment_validity ?? (fine.outcome === "pending" ? "pending" : "valid");
}

export function currentFineAnnotation(segment: Segment): FineAnnotation {
  const fine = segment.fine_annotation;
  const skill = fine?.skill || segment.skill || "";
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
    skill,
    segment_validity:
      fine?.segment_validity ??
      (fine?.outcome === "pending"
        ? "pending"
        : fine
          ? "valid"
          : segment.source === "user"
            ? "pending"
            : "valid"),
    template_version: 1,
    template_values: withSkillTemplateDefaults(skill, fine?.template_values || {}),
  };
}

export function templateIssues(segment: Segment): string[] {
  const fine = currentFineAnnotation(segment);
  const validity = effectiveSegmentValidity(fine);
  if (validity === "pending") return ["片段有效性"];
  if (validity === "invalid") {
    const missing = fine.invalid_reason_code ? [] : ["无效原因"];
    if (fine.invalid_reason_code === "other" && !fine.invalid_reason_detail?.trim())
      missing.push("无效原因说明");
    return missing;
  }
  const skill = fine.skill;
  if (skill && !isSkillEnabled(skill)) return ["Skill 暂未开放"];
  if (!skill) return ["技能"];
  const values = withSkillTemplateDefaults(skill, fine.template_values || {});
  const missing = [
    ...(fine.outcome === "pending" ? ["结果"] : []),
    ...(fine.outcome === "failure"
      ? []
      : sentenceTokens(skill, values).flatMap((token) =>
          typeof token === "string"
            ? []
            : (() => {
                const value = sentenceFieldValue(token, values);
                return !token.optional &&
                  (!value || (token.options && !token.options.includes(value)))
                  ? [token.label]
                  : [];
              })(),
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
  } else if (skill === "Pick") {
    missing.push(...keyframeFrameIssues(fine, segment.start_frame, segment.end_frame));
  } else if (skill === "Place") {
    missing.push(...keyframeFrameIssues(fine, segment.start_frame, segment.end_frame));
  } else if (!validPoint(fine.keyframe_point)) missing.push("片段内关键帧位置");
  return missing;
}

function tokenText(skill: string, values: Record<string, string>): string {
  const effectiveValues = withSkillTemplateDefaults(skill, values);
  return sentenceTokensForOutput(skill, effectiveValues)
    .map((token) =>
      typeof token === "string"
        ? token
        : sentenceFieldValue(token, effectiveValues) &&
            (!token.options || token.options.includes(sentenceFieldValue(token, effectiveValues)!))
          ? sentenceFieldValue(token, effectiveValues)!
          : token.optional
            ? ""
            : "【" + token.label + "】",
    )
    .join("");
}

function tokenPreviewParts(
  skill: string,
  values: Record<string, string>,
): FineAnnotationPreviewPart[] {
  const effectiveValues = withSkillTemplateDefaults(skill, values);
  return sentenceTokensForOutput(skill, effectiveValues).flatMap(
    (token): FineAnnotationPreviewPart[] => {
      if (typeof token === "string") return [{ text: token, kind: "plain" }];
      const value = sentenceFieldValue(token, effectiveValues);
      if (value && (!token.options || token.options.includes(value))) {
        return [{ text: `【${value}】`, kind: "filled" }];
      }
      return token.optional ? [] : [{ text: `【${token.label}】`, kind: "missing" }];
    },
  );
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

function retryPreviewParts(fine: FineAnnotation): FineAnnotationPreviewPart[] {
  const recovery = fine.recovery_action?.trim();
  const target = fine.target_point_label?.trim();
  const pointId = fine.target_point_id?.trim();
  if (!recovery && !target) return [];
  const parts: FineAnnotationPreviewPart[] = [{ text: "失败后", kind: "plain" }];
  if (recovery) {
    parts.push({ text: "，", kind: "plain" }, { text: `【${recovery}】`, kind: "filled" });
  }
  if (target) {
    parts.push(
      { text: "，重新对准", kind: "plain" },
      { text: `【${target}】`, kind: "filled" },
      ...(pointId
        ? [
            { text: "（", kind: "plain" as const },
            { text: `【${pointId}】`, kind: "filled" as const },
            { text: "）", kind: "plain" as const },
          ]
        : []),
    );
  }
  parts.push({ text: "。", kind: "plain" });
  return parts;
}

function failurePreviewParts(fine: FineAnnotation): FineAnnotationPreviewPart[] {
  const parts: FineAnnotationPreviewPart[] = [{ text: "本次尝试失败，原因是", kind: "plain" }];
  const code = fine.failure_reason_code;
  const direction = fine.failure_direction?.trim();
  const detail = fine.failure_detail?.trim();
  if (!code) {
    parts.push({ text: "【失败原因】", kind: "missing" });
  } else if (code === "gripper_deviated") {
    parts.push({ text: "夹爪向", kind: "plain" });
    parts.push(
      direction
        ? { text: `【${direction}】`, kind: "filled" }
        : { text: "【偏移方向】", kind: "missing" },
    );
    parts.push({ text: "偏移", kind: "plain" });
  } else if (code === "other") {
    parts.push(
      detail
        ? { text: `【${detail}】`, kind: "filled" }
        : { text: "【失败原因说明】", kind: "missing" },
    );
  } else {
    parts.push({
      text: failureReasonLabel(code, direction, detail),
      kind: "plain",
    });
  }
  if (detail && code && code !== "other") {
    parts.push(
      { text: "（", kind: "plain" },
      { text: `【${detail}】`, kind: "filled" },
      { text: "）", kind: "plain" },
    );
  }
  parts.push({ text: "。", kind: "plain" });
  return parts;
}

function invalidPreviewParts(fine: FineAnnotation): FineAnnotationPreviewPart[] {
  const code = fine.invalid_reason_code;
  const detail = fine.invalid_reason_detail?.trim();
  const reason = code ? invalidSegmentReasonLabel(code, detail) : "无效原因";
  const missingOtherDetail = code === "other" && !detail;
  const missingReasonText = missingOtherDetail ? "无效原因说明" : reason;
  return [
    { text: "本片段无效，原因是", kind: "plain" },
    {
      text: code && !missingOtherDetail ? `【${reason}】` : `【${missingReasonText}】`,
      kind: code && !missingOtherDetail ? "filled" : "missing",
    },
    ...(detail && code !== "other"
      ? [
          { text: "（", kind: "plain" as const },
          { text: `【${detail}】`, kind: "filled" as const },
          { text: "）", kind: "plain" as const },
        ]
      : []),
    { text: "。", kind: "plain" },
  ];
}

export function fineAnnotationPreview(fine: FineAnnotation): FineAnnotationPreviewPart[] {
  const validity = effectiveSegmentValidity(fine);
  if (validity === "invalid") {
    return [
      ...invalidPreviewParts(fine),
      ...(fine.notes ? [{ text: ` ${fine.notes}`, kind: "plain" as const }] : []),
    ];
  }
  if (validity === "pending") return [{ text: "【请选择片段有效性】", kind: "missing" }];
  if (!getSkillDefinition(fine.skill || "")) {
    return [{ text: "【请选择技能】", kind: "missing" }];
  }
  const outcome = fine.outcome || "pending";
  if (outcome === "failure") {
    return [
      ...failurePreviewParts(fine),
      ...(fine.notes ? [{ text: ` ${fine.notes}`, kind: "plain" as const }] : []),
    ];
  }
  const values = fine.template_values || {};
  const parts = [...retryPreviewParts(fine), ...tokenPreviewParts(fine.skill || "", values)];
  if (outcome === "pending") parts.push({ text: "【请选择结果】", kind: "missing" });
  if (fine.notes) parts.push({ text: ` ${fine.notes}`, kind: "plain" });
  return parts;
}

export function fineAnnotationText(fine: FineAnnotation): string {
  const validity = effectiveSegmentValidity(fine);
  if (validity === "invalid") {
    const reason = invalidSegmentReasonLabel(fine.invalid_reason_code, fine.invalid_reason_detail);
    const detail =
      fine.invalid_reason_code && fine.invalid_reason_code !== "other"
        ? fine.invalid_reason_detail?.trim()
        : "";
    return [`本片段无效，原因是${reason}${detail ? `（${detail}）` : ""}。`, fine.notes]
      .filter(Boolean)
      .join(" ");
  }
  if (validity === "pending") return "【请选择片段有效性】";
  const values = fine.template_values || {};
  if (!getSkillDefinition(fine.skill || "")) return "【请选择技能】";
  const outcome = fine.outcome || "pending";
  if (outcome === "failure") {
    return [failureText(fine), fine.notes].filter(Boolean).join(" ");
  }
  const sentence = tokenText(fine.skill || "", values);
  const status = outcome === "pending" ? "【请选择结果】" : "";
  return [retryText(fine), sentence, status, fine.notes].filter(Boolean).join(" ");
}
