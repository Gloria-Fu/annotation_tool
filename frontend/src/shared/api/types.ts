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
  original_text?: string;
  source?: string;
  skill?: string | null;
  fine_annotation?: FineAnnotation;
};
export type FineAction = {
  id: string;
  description?: string;
  hand: string;
  gripper: string;
  movement: string;
  target: string;
  point: string;
};
export type FineStage = {
  id: string;
  title: string;
  required: boolean;
  fields: { label: string; value: string }[];
  keyframe: string;
  logic: string;
};
export type FineAnnotation = {
  skill?: string;
  operator_hand?: "左手" | "右手" | "双手" | "";
  object_name: string;
  object_color: string;
  object_material: string;
  contact_point: string;
  position_start: string;
  position_end: string;
  hand_state?: "张开->闭合" | "闭合->张开" | "保持闭合" | "保持张开" | "";
  keyframe_point?: {
    frame: number;
    view: string;
    x: number;
    y: number;
  };
  outcome: "success" | "failure";
  end_condition: string;
  actions: FineAction[];
  template?: "push_pull" | "custom";
  stages?: FineStage[];
  failure_reason: string;
  recovery: string;
  notes: string;
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
