import { describe, expect, it } from "vitest";
import type { TaskItem, User } from "../../shared/api/types";
import { canAnnotateItem, canReviewItem, isWorkbenchReadOnly } from "./workPermissions";

function item(overrides: Partial<TaskItem>): TaskItem {
  return {
    id: "item-1",
    package_id: "package-1",
    episode_id: "episode-1",
    claim_order: 0,
    status: "completed",
    annotator_id: "annotator-1",
    reviewer_id: "reviewer-1",
    qa_status: "unchecked",
    updated_at: "2026-09-17T00:00:00Z",
    ...overrides,
  };
}

function user(overrides: Pick<User, "id" | "role">): Pick<User, "id" | "role"> {
  return overrides;
}

describe("workbench permissions", () => {
  it("keeps quality sampling review of completed items read-only for developer admins", () => {
    const completed = item({
      status: "completed",
      annotator_id: "annotator-1",
      reviewer_id: "reviewer-1",
    });

    expect(isWorkbenchReadOnly(completed, user({ id: "admin-1", role: "developer_admin" }))).toBe(
      true,
    );
    expect(canAnnotateItem(completed, "admin-1")).toBe(false);
    expect(canReviewItem(completed, "admin-1")).toBe(false);
  });

  it("allows only the assigned annotator to resubmit quality rework", () => {
    const rework = item({
      status: "changes_requested",
      annotator_id: "annotator-1",
      reviewer_id: null,
      qa_status: "rejected",
    });

    expect(canAnnotateItem(rework, "annotator-1")).toBe(true);
    expect(isWorkbenchReadOnly(rework, user({ id: "annotator-1", role: "annotator" }))).toBe(false);
    expect(isWorkbenchReadOnly(rework, user({ id: "admin-1", role: "developer_admin" }))).toBe(
      true,
    );
  });

  it("allows only the assigned reviewer to approve review tasks", () => {
    const review = item({
      status: "review_assigned",
      annotator_id: "annotator-1",
      reviewer_id: "reviewer-1",
    });

    expect(canReviewItem(review, "reviewer-1")).toBe(true);
    expect(isWorkbenchReadOnly(review, user({ id: "reviewer-1", role: "reviewer" }))).toBe(false);
    expect(isWorkbenchReadOnly(review, user({ id: "admin-1", role: "developer_admin" }))).toBe(
      true,
    );
  });
});
