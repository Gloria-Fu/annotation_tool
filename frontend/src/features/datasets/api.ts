import { api } from "../../shared/api/client";
import type { Dataset } from "../../shared/api/types";

export type DatasetInput = { project_id: string; name: string; root_path: string };

export const datasetsApi = {
  list: (projectId: string) => api<Dataset[]>(`/datasets?project_id=${projectId}`),
  create: (input: DatasetInput) =>
    api<Dataset>("/datasets", { method: "POST", body: JSON.stringify(input) }),
};
