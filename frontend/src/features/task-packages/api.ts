import { api } from "../../shared/api/client";
import type {
  ItemStatus,
  Role,
  TaskItem,
  TaskPackage,
  User,
  UserGroupSummary,
} from "../../shared/api/types";

export type PackageInput = {
  project_id: string;
  dataset_id: string;
  title: string;
  claim_policy: "sequential" | "random";
  item_count: number;
};

export type MyTaskView = "pending" | "history";

export const taskPackagesApi = {
  list: (projectId: string) => api<TaskPackage[]>(`/task-packages?project_id=${projectId}`),
  create: (input: PackageInput) =>
    api<TaskPackage>("/task-packages", { method: "POST", body: JSON.stringify(input) }),
  publish: (packageId: string) =>
    api<TaskPackage>(`/task-packages/${packageId}/publish`, { method: "POST" }),
  groups: (packageId: string) => api<UserGroupSummary[]>(`/task-packages/${packageId}/groups`),
  groupOptions: (packageId: string) =>
    api<UserGroupSummary[]>(`/task-packages/${packageId}/group-options`),
  addGroup: (packageId: string, groupId: string) =>
    api<UserGroupSummary>(`/task-packages/${packageId}/groups`, {
      method: "POST",
      body: JSON.stringify({ group_id: groupId }),
    }),
  removeGroup: (packageId: string, groupId: string) =>
    api<void>(`/task-packages/${packageId}/groups/${groupId}`, { method: "DELETE" }),
  items: (packageId: string, status?: ItemStatus) =>
    api<TaskItem[]>(`/task-packages/${packageId}/items${status ? `?status=${status}` : ""}`),
  claim: (packageId: string, review: boolean, claimPolicy?: "sequential" | "random") => {
    const params = new URLSearchParams({ package_id: packageId });
    if (review && claimPolicy) params.set("claim_policy", claimPolicy);
    return api<TaskItem>(
      `/${review ? "review-tasks" : "annotation-tasks"}/claim?${params.toString()}`,
      { method: "POST" },
    );
  },
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
  myTasks: (review: boolean, view: MyTaskView = "pending") =>
    api<TaskItem[]>(`/my-tasks?stage=${review ? "review" : "annotation"}&view=${view}`),
  usersForStage: (users: User[], stage: "annotation" | "review") => {
    const roles: Role[] =
      stage === "annotation"
        ? ["annotator", "annotation_manager"]
        : ["reviewer", "annotation_manager"];
    return users.filter((user) => roles.includes(user.role));
  },
};
