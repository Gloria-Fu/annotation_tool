import { describe, expect, it } from "vitest";
import { ApiError } from "../../shared/api/client";
import { claimFailureMessage, claimFailureTitle } from "./claimFailure";

describe("claim failure content", () => {
  it("shows the annotation claim reason in an error modal", () => {
    const error = new ApiError(409, "暂无可领取标注任务：所有条目已被领取。");

    expect(claimFailureTitle(false)).toBe("领取标注失败");
    expect(claimFailureMessage(error)).toBe(error.message);
  });

  it("shows the review claim reason in an error modal", () => {
    const error = new ApiError(409, "暂无可领取审核任务：没有待审核条目。");

    expect(claimFailureTitle(true)).toBe("领取审核失败");
    expect(claimFailureMessage(error)).toBe(error.message);
  });
});
