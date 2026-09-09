import { api } from "../../shared/api/client";
import type { QaStatus, TaskItem } from "../../shared/api/types";

export const qualityApi = {
  completedItems: (packageId: string) =>
    api<TaskItem[]>(`/task-packages/${packageId}/items?status=completed`),
  check: (itemId: string, result: Exclude<QaStatus, "unchecked">) =>
    api<TaskItem>(`/work-items/${itemId}/quality-check`, {
      method: "POST",
      body: JSON.stringify({ result }),
    }),
};
