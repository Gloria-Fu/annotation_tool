import { api } from "../../shared/api/client";
import type {
  AnnotationPayload,
  RevisionSnapshot,
  TaskItem,
  WorkContext,
} from "../../shared/api/types";

export type RevisionInput = {
  schema_version: "segments.v1";
  payload: AnnotationPayload;
  base_revision_id?: string | null;
};

export const workbenchApi = {
  context: (itemId: string) => api<WorkContext>(`/work-items/${itemId}/context`),
  saveDraft: (itemId: string, input: RevisionInput) =>
    api<TaskItem>(`/work-items/${itemId}/draft`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  submit: (itemId: string, input: RevisionInput) =>
    api<TaskItem>(`/work-items/${itemId}/submit`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  clear: (itemId: string) => api<TaskItem>(`/work-items/${itemId}/clear`, { method: "POST" }),
  review: (
    itemId: string,
    input: {
      decision: "approve" | "request_changes";
      comment?: string;
      payload?: AnnotationPayload;
    },
  ) =>
    api<TaskItem>(`/work-items/${itemId}/review`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  revisionInput: (
    segments: import("../../shared/api/types").Segment[],
    revision?: RevisionSnapshot | null,
  ) => ({
    schema_version: "segments.v1" as const,
    payload: { schema_version: "segments.v1", segments },
    base_revision_id: revision?.id ?? null,
  }),
};
