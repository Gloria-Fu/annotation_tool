import type { components } from "./generated";

export type Role = components["schemas"]["Role"];
export type User = components["schemas"]["UserOut"];
export type Project = components["schemas"]["ProjectOut"];
export type Dataset = components["schemas"]["DatasetOut"];
export type TaskPackage = components["schemas"]["PackageOut"];
export type TaskItem = components["schemas"]["TaskItemOut"];
export type ClaimPolicy = components["schemas"]["ClaimPolicy"];
export type ItemStatus = components["schemas"]["ItemStatus"];
export type QaStatus = components["schemas"]["QaStatus"];
export type Segment = {
  id: string;
  start_frame: number;
  end_frame: number;
  text: string;
  source?: string;
  skill?: string | null;
};
export type AnnotationPayload = {
  schema_version?: string;
  segments?: Segment[];
  [key: string]: unknown;
};
export type RevisionSnapshot = {
  id?: string | null;
  version: number;
  schema_version: string;
  payload: AnnotationPayload;
  stage: string;
  file_path?: string | null;
  file_hash?: string | null;
};
export type WorkContext = Omit<components["schemas"]["WorkContext"], "latest_revision"> & {
  latest_revision: RevisionSnapshot | null;
};
export type Stats = components["schemas"]["StatsOut"];
