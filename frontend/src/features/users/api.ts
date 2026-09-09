import { api } from "../../shared/api/client";
import type { Role, User } from "../../shared/api/types";

export type UserInput = {
  username: string;
  display_name: string;
  password: string;
  role: Role;
  project_ids: string[];
};

export const usersApi = {
  list: () => api<User[]>("/users"),
  create: (input: UserInput) =>
    api<User>("/users", { method: "POST", body: JSON.stringify(input) }),
  update: (userId: string, input: { is_active: boolean }) =>
    api<User>(`/users/${userId}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (userId: string) => api<void>(`/users/${userId}`, { method: "DELETE" }),
};
