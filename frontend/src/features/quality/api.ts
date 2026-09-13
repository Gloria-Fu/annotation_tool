import { api } from "../../shared/api/client";
import type {
  QaStatus,
  QualityBatch,
  QualityBatchDetail,
  QualityCheck,
  TaskItem,
} from "../../shared/api/types";

export const qualityApi = {
  batches: (projectId: string) =>
    api<QualityBatch[]>(`/quality-batches?project_id=${encodeURIComponent(projectId)}`),
  batch: (batchId: string) => api<QualityBatchDetail>(`/quality-batches/${batchId}`),
  createBatch: (input: {
    package_id: string;
    assignee_id?: string;
    mode: "all" | "ratio" | "count";
    percent: number;
    count: number;
    seed: string;
    only_unchecked: boolean;
  }) =>
    api<QualityBatchDetail>("/quality-batches", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  check: (
    batchId: string,
    itemId: string,
    result: Exclude<QaStatus, "unchecked">,
    comment?: string,
  ) =>
    api<TaskItem>(`/quality-batches/${batchId}/items/${itemId}/check`, {
      method: "POST",
      body: JSON.stringify({ result, comment, batch_id: batchId }),
    }),
  history: (itemId: string) => api<QualityCheck[]>(`/work-items/${itemId}/quality-history`),
};
