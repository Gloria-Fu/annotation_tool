import { api } from "../../shared/api/client";
import type { UserGroup } from "../../shared/api/types";

export type UserGroupInput = {
  name: string;
  description?: string;
  manager_id?: string | null;
};

export const userGroupsApi = {
  list: () => api<UserGroup[]>("/user-groups"),
  create: (input: UserGroupInput) =>
    api<UserGroup>("/user-groups", { method: "POST", body: JSON.stringify(input) }),
  update: (groupId: string, input: UserGroupInput) =>
    api<UserGroup>(`/user-groups/${groupId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (groupId: string) => api<void>(`/user-groups/${groupId}`, { method: "DELETE" }),
  addMember: (groupId: string, userId: string) =>
    api<UserGroup>(`/user-groups/${groupId}/members`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    }),
  removeMember: (groupId: string, userId: string) =>
    api<UserGroup>(`/user-groups/${groupId}/members/${userId}`, { method: "DELETE" }),
};
