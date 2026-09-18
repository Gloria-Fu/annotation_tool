export const WORK_ISSUE_TYPE_OPTIONS = [
  { value: "keyframe_error", label: "关键帧错误" },
  { value: "segment_boundary", label: "分段边界错误" },
  { value: "skill_error", label: "Skill 错误" },
  { value: "field_error", label: "字段填写错误" },
  { value: "hand_error", label: "左右手错误" },
  { value: "object_error", label: "物体/位置错误" },
  { value: "missing_annotation", label: "漏标" },
  { value: "extra_annotation", label: "多标" },
  { value: "other", label: "其他问题" },
] as const;

export const WORK_ISSUE_SEVERITY_OPTIONS = [
  { value: "critical", label: "致命" },
  { value: "major", label: "严重" },
  { value: "minor", label: "一般" },
  { value: "suggestion", label: "建议" },
] as const;

export type WorkIssueType = (typeof WORK_ISSUE_TYPE_OPTIONS)[number]["value"];
export type WorkIssueSeverity = (typeof WORK_ISSUE_SEVERITY_OPTIONS)[number]["value"];
export type WorkIssueSource = "review" | "quality";

export type WorkIssueRecord = {
  id: string;
  source: WorkIssueSource;
  segment_id: string;
  segment_index: number;
  segment_label: string;
  skill?: string;
  frame: number;
  time_seconds: number;
  issue_type: WorkIssueType;
  severity: WorkIssueSeverity;
  comment: string;
  created_at: string;
};

function optionLabel<T extends string>(options: readonly { value: T; label: string }[], value: T) {
  return options.find((option) => option.value === value)?.label || value;
}

export function issueTypeLabel(value: WorkIssueType) {
  return optionLabel(WORK_ISSUE_TYPE_OPTIONS, value);
}

export function issueSeverityLabel(value: WorkIssueSeverity) {
  return optionLabel(WORK_ISSUE_SEVERITY_OPTIONS, value);
}

export function issueSourceLabel(value: WorkIssueSource) {
  return value === "review" ? "审核退回" : "抽检退回";
}

export function issueAnchorLabel(segmentIndex: number, skill?: string) {
  return `第 ${segmentIndex} 段${skill ? ` ${skill}` : ""}`;
}

export function formatIssueRecord(issue: WorkIssueRecord) {
  const time = issue.time_seconds.toFixed(2);
  return `${issue.segment_label}，帧 ${issue.frame}（${time}s），${issueSeverityLabel(
    issue.severity,
  )} / ${issueTypeLabel(issue.issue_type)}：${issue.comment}`;
}

export function composeReturnComment(manualComment: string | undefined, issues: WorkIssueRecord[]) {
  const lines: string[] = [];
  const trimmed = (manualComment || "").trim();
  if (trimmed) lines.push(`总体说明：${trimmed}`);
  if (issues.length) {
    if (lines.length) lines.push("");
    lines.push(`问题记录（${issues.length} 条）：`);
    issues.forEach((issue, index) => {
      lines.push(`${index + 1}. ${formatIssueRecord(issue)}`);
    });
  }
  return lines.join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWorkIssueType(value: unknown): value is WorkIssueType {
  return WORK_ISSUE_TYPE_OPTIONS.some((option) => option.value === value);
}

function isWorkIssueSeverity(value: unknown): value is WorkIssueSeverity {
  return WORK_ISSUE_SEVERITY_OPTIONS.some((option) => option.value === value);
}

function isWorkIssueSource(value: unknown): value is WorkIssueSource {
  return value === "review" || value === "quality";
}

export function parseIssueRecords(value: string | null): WorkIssueRecord[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is WorkIssueRecord => {
      if (!isRecord(item)) return false;
      return (
        typeof item.id === "string" &&
        isWorkIssueSource(item.source) &&
        typeof item.segment_id === "string" &&
        typeof item.segment_index === "number" &&
        typeof item.segment_label === "string" &&
        typeof item.frame === "number" &&
        typeof item.time_seconds === "number" &&
        isWorkIssueType(item.issue_type) &&
        isWorkIssueSeverity(item.severity) &&
        typeof item.comment === "string" &&
        typeof item.created_at === "string"
      );
    });
  } catch {
    return [];
  }
}
