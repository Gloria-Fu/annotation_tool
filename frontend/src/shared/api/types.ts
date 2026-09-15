import type { components } from "./generated";

export type Role = components["schemas"]["Role"];
export type User = components["schemas"]["UserOut"];
export type UserGroup = components["schemas"]["UserGroupOut"];
export type UserGroupMember = components["schemas"]["UserGroupMemberOut"];
export type UserGroupSummary = components["schemas"]["UserGroupSummaryOut"];
export type Project = components["schemas"]["ProjectOut"];
export type Dataset = components["schemas"]["DatasetOut"];
export type TaskPackage = components["schemas"]["PackageOut"] & {
  total_items: number;
  claimed_items: number;
  annotated_items: number;
  reviewed_items: number;
};
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
  attempt_group_id?: string;
  retry_of?: string;
  fine_annotation?: FineAnnotation;
  annotation_status?: "unannotated" | "in_progress" | "confirmed";
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
export type KeyframePoint = { frame: number; view: string; x: number; y: number };
export type OperatorHand = "left" | "right";
export type JawMark = { visibility: "visible"; x: number; y: number } | { visibility: "invisible" };
export type AnnotationOutcome = "pending" | "success" | "failure";
export type SegmentValidity = "pending" | "valid" | "invalid";
export type InvalidSegmentReasonCode =
  "no_motion" | "bad_segmentation" | "visual_issue" | "duplicate" | "other";
export type FailureReasonCode =
  "gripper_closed_early" | "gripper_deviated" | "object_dropped" | "failed_to_grasp" | "other";
export type GripperKeyframe = {
  frame: number;
  view: string;
  left?: JawMark;
  right?: JawMark;
};
export type FineAnnotation = {
  template_version?: 1;
  template_values?: Record<string, string>;
  skill?: string;
  operator_hand?: "左手" | "右手" | "双手" | "";
  segment_validity?: SegmentValidity;
  invalid_reason_code?: InvalidSegmentReasonCode;
  invalid_reason_detail?: string;
  outcome: AnnotationOutcome;
  failure_reason_code?: FailureReasonCode;
  failure_direction?: string;
  failure_detail?: string;
  recovery_action?: string;
  target_point_id?: string;
  target_point_label?: string;
  object_name: string;
  object_color: string;
  object_material: string;
  contact_point: string;
  position_start: string;
  position_end: string;
  hand_state?: "张开->闭合" | "闭合->张开" | "保持闭合" | "保持张开" | "";
  keyframe_point?: KeyframePoint;
  keyframe_points?: { left?: KeyframePoint; right?: KeyframePoint };
  keyframe_frame?: number;
  gripper_keyframes?: Partial<Record<OperatorHand, GripperKeyframe>>;
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
export type WorkContextUser = Pick<User, "id" | "username" | "display_name">;
export type WorkContext = Omit<
  components["schemas"]["WorkContext"],
  "latest_revision" | "annotator" | "reviewer"
> & {
  latest_revision: RevisionSnapshot | null;
  annotator?: WorkContextUser | null;
  reviewer?: WorkContextUser | null;
  review_comment?: string | null;
  quality_comment?: string | null;
};
export type Stats = components["schemas"]["StatsOut"];
export type WorkMetric = components["schemas"]["WorkMetricOut"];
export type PersonalWorkStatistics = components["schemas"]["PersonalWorkStatisticsOut"];
export type PeopleWorkStatistics = components["schemas"]["PeopleWorkStatisticsOut"];
export type QualityBatch = components["schemas"]["QualityBatchOut"];
export type QualityBatchDetail = components["schemas"]["QualityBatchDetailOut"];
export type QualitySample = components["schemas"]["QualitySampleOut"];
export type QualityCheck = components["schemas"]["QualityCheckOut"];
