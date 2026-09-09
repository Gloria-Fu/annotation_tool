import { api } from "../../shared/api/client";
import type { ItemStatus, Role, TaskItem, TaskPackage, User } from "../../shared/api/types";

export type PackageInput = {
  project_id: string;
  dataset_id: string;
  title: string;
  claim_policy: "sequential" | "random";
  member_ids?: string[];
  episode_start?: number;
  episode_end?: number;
};

export const taskPackagesApi = {
  list: (projectId: string) => api<TaskPackage[]>(`/task-packages?project_id=${projectId}`),
  create: (input: PackageInput) =>
    api<TaskPackage>("/task-packages", { method: "POST", body: JSON.stringify(input) }),
  publish: (packageId: string) =>
    api<TaskPackage>(`/task-packages/${packageId}/publish`, { method: "POST" }),
  items: (packageId: string, status?: ItemStatus) =>
    api<TaskItem[]>(`/task-packages/${packageId}/items${status ? `?status=${status}` : ""}`),
  claim: (packageId: string, review: boolean) =>
    api<TaskItem>(
      `/${review ? "review-tasks" : "annotation-tasks"}/claim?package_id=${packageId}`,
      {
        method: "POST",
      },
    ),
  assign: (
    packageId: string,
    input: { item_ids: string[]; assignee_id: string; stage: "annotation" | "review" },
  ) =>
    api<TaskItem[]>(`/task-packages/${packageId}/assign`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  reclaim: (itemId: string) =>
    api<TaskItem>(`/task-items/${itemId}/reclaim`, {
      method: "POST",
      body: JSON.stringify({ reason: "管理员手动回收" }),
    }),
  myTasks: (review: boolean) =>
    api<TaskItem[]>(`/my-tasks?stage=${review ? "review" : "annotation"}`),
  usersForStage: (users: User[], stage: "annotation" | "review") => {
    const roles: Role[] =
      stage === "annotation"
        ? ["annotator", "annotation_manager"]
        : ["reviewer", "annotation_manager"];
    return users.filter((user) => roles.includes(user.role));
  },
};
