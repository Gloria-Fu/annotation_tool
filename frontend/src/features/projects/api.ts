import { api } from "../../shared/api/client";
import type { Project } from "../../shared/api/types";

export type ProjectInput = { name: string; description?: string };

export const projectsApi = {
  list: () => api<Project[]>("/projects"),
  create: (input: ProjectInput) =>
    api<Project>("/projects", { method: "POST", body: JSON.stringify(input) }),
};
