import { api } from "../../shared/api/client";
import type { User } from "../../shared/api/types";

export type LoginInput = { username: string; password: string };
export type PasswordChangeInput = { current_password: string; new_password: string };

export const authApi = {
  me: () => api<User>("/auth/me"),
  login: (input: LoginInput) =>
    api<User>("/auth/login", { method: "POST", body: JSON.stringify(input) }),
  logout: () => api<void>("/auth/logout", { method: "POST" }),
  changePassword: (input: PasswordChangeInput) =>
    api<User>("/auth/change-password", { method: "POST", body: JSON.stringify(input) }),
};
