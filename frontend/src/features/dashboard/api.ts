import { api, API_BASE } from "../../shared/api/client";
import type { Stats } from "../../shared/api/types";

export const dashboardApi = {
  stats: (projectId: string) => api<Stats>(`/stats?project_id=${projectId}`),
  reportUrl: (projectId: string) => `${API_BASE}/reports/tasks.csv?project_id=${projectId}`,
};
