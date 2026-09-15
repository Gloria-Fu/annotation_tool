import type { InvalidSegmentReasonCode, SegmentValidity } from "../../shared/api/types";

export const SEGMENT_VALIDITY_OPTIONS: { value: SegmentValidity; label: string }[] = [
  { value: "pending", label: "待判定" },
  { value: "valid", label: "有效片段" },
  { value: "invalid", label: "无效片段" },
];

export const INVALID_SEGMENT_REASON_OPTIONS: {
  value: InvalidSegmentReasonCode;
  label: string;
}[] = [
  { value: "no_motion", label: "静止无动作" },
  { value: "bad_segmentation", label: "片段切分错误" },
  { value: "visual_issue", label: "画面异常或遮挡" },
  { value: "duplicate", label: "重复片段" },
  { value: "other", label: "其他" },
];

export function invalidSegmentReasonLabel(
  code?: InvalidSegmentReasonCode,
  detail?: string,
): string {
  if (!code) return "【无效原因】";
  if (code === "other") return detail?.trim() || "【无效原因说明】";
  return (
    INVALID_SEGMENT_REASON_OPTIONS.find((option) => option.value === code)?.label || "【无效原因】"
  );
}
