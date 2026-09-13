import type { FailureReasonCode } from "../../shared/api/types";

export const FAILURE_REASON_OPTIONS: { value: FailureReasonCode; label: string }[] = [
  { value: "gripper_closed_early", label: "夹爪提前关闭" },
  { value: "gripper_deviated", label: "夹爪向某方向偏移" },
  { value: "object_dropped", label: "物体中途掉落" },
  { value: "failed_to_grasp", label: "未形成有效夹持" },
  { value: "other", label: "其他" },
];

export function failureReasonLabel(
  code?: FailureReasonCode,
  direction?: string,
  detail?: string,
): string {
  if (!code) return "【失败原因】";
  if (code === "gripper_deviated")
    return direction?.trim() ? `夹爪向${direction.trim()}偏移` : "夹爪向【偏移方向】偏移";
  if (code === "other") return detail?.trim() || "【失败原因说明】";
  return FAILURE_REASON_OPTIONS.find((option) => option.value === code)?.label || "【失败原因】";
}
