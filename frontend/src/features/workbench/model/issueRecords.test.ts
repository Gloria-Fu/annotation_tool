import { describe, expect, it } from "vitest";
import {
  composeReturnComment,
  formatIssueRecord,
  parseIssueRecords,
  type WorkIssueRecord,
} from "./issueRecords";

const issue: WorkIssueRecord = {
  id: "issue-1",
  source: "quality",
  segment_id: "segment-4",
  segment_index: 4,
  segment_label: "第 4 段 Place",
  skill: "Place",
  frame: 1299,
  time_seconds: 37.74,
  issue_type: "keyframe_error",
  severity: "major",
  comment: "关键帧偏晚，应记录夹爪刚释放物体的瞬间",
  created_at: "2026-09-18T10:00:00.000Z",
};

describe("issue records", () => {
  it("formats issue records with anchor and structured labels", () => {
    expect(formatIssueRecord(issue)).toBe(
      "第 4 段 Place，帧 1299（37.74s），严重 / 关键帧错误：关键帧偏晚，应记录夹爪刚释放物体的瞬间",
    );
  });

  it("combines manual return notes with recorded issues", () => {
    expect(composeReturnComment("请重点复核释放动作", [issue])).toContain(
      "总体说明：请重点复核释放动作\n\n问题记录（1 条）：\n1. 第 4 段 Place",
    );
  });

  it("drops invalid stored issue records", () => {
    const parsed = parseIssueRecords(JSON.stringify([issue, { id: "broken" }]));

    expect(parsed).toEqual([issue]);
  });
});
