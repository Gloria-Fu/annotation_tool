import type { ItemStatus, TaskItem, User } from "../../shared/api/types";

const ANNOTATION_EDITABLE_STATUSES = new Set<ItemStatus>([
  "annotation_assigned",
  "annotating",
  "changes_requested",
]);

const REVIEW_EDITABLE_STATUSES = new Set<ItemStatus>(["review_assigned", "reviewing"]);

export function canAnnotateItem(item: TaskItem, userId: string): boolean {
  return item.annotator_id === userId && ANNOTATION_EDITABLE_STATUSES.has(item.status);
}

export function canReviewItem(item: TaskItem, userId: string): boolean {
  return (
    item.reviewer_id === userId &&
    item.annotator_id !== userId &&
    REVIEW_EDITABLE_STATUSES.has(item.status)
  );
}

export function isWorkbenchReadOnly(item: TaskItem, user: Pick<User, "id" | "role">): boolean {
  return (
    user.role === "outsourcing_manager" ||
    (!canAnnotateItem(item, user.id) && !canReviewItem(item, user.id))
  );
}
