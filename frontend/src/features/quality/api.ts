import { api } from "../../shared/api/client";
import type {
  QaStatus,
  QualityBatch,
  QualityBatchDetail,
  QualityCheck,
  TaskItem,
} from "../../shared/api/types";

const CREATE_BATCH_TIMEOUT_MS = 20_000;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function withTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMessage: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), CREATE_BATCH_TIMEOUT_MS);
  try {
    return await request(controller.signal);
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(timeoutMessage, { cause: error });
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

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
    withTimeout(
      (signal) =>
        api<QualityBatchDetail>("/quality-batches?include_samples=false", {
          method: "POST",
          body: JSON.stringify(input),
          signal,
        }),
      "生成抽检清单超时，请缩小抽检范围或稍后重试。",
    ),
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
