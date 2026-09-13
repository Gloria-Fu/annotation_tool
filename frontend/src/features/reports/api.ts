import { api, API_BASE } from "../../shared/api/client";
import type { PeopleWorkStatistics, PersonalWorkStatistics, Role } from "../../shared/api/types";

export type Granularity = "day" | "week" | "month";

export type WorkStatisticsQuery = {
  projectId?: string;
  startDate: string;
  endDate: string;
  granularity?: Granularity;
  role?: Role;
};

function queryString(query: WorkStatisticsQuery): string {
  const params = new URLSearchParams({
    start_date: query.startDate,
    end_date: query.endDate,
  });
  if (query.projectId) params.set("project_id", query.projectId);
  if (query.granularity) params.set("granularity", query.granularity);
  if (query.role) params.set("role", query.role);
  return params.toString();
}

export const reportsApi = {
  personal: (query: WorkStatisticsQuery) =>
    api<PersonalWorkStatistics>(`/work-statistics/me?${queryString(query)}`),
  people: (query: WorkStatisticsQuery) =>
    api<PeopleWorkStatistics>(`/work-statistics/people?${queryString(query)}`),
  personalCsvUrl: (query: WorkStatisticsQuery) =>
    `${API_BASE}/work-statistics/me.csv?${queryString(query)}`,
  peopleCsvUrl: (query: WorkStatisticsQuery) =>
    `${API_BASE}/work-statistics/people.csv?${queryString(query)}`,
};
