export const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(response.status, body.detail || "请求失败");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type Role = "developer_admin" | "annotation_manager" | "reviewer" | "annotator";
export type User = { id: string; username: string; display_name: string; role: Role; is_active: boolean; must_change_password: boolean };
export type Project = { id: string; name: string; description?: string; is_active: boolean };
export type Dataset = { id: string; project_id: string; name: string; root_path: string; status: string; episode_count: number; warning_count: number; error_message?: string };
export type TaskPackage = { id: string; project_id: string; dataset_id: string; title: string; description?: string; status: string; claim_policy: string; random_seed?: number };
export type TaskItem = { id: string; package_id: string; episode_id: string; claim_order: number; status: string; annotator_id?: string; reviewer_id?: string; qa_status: string };

export const roleLabels: Record<Role, string> = {
  developer_admin: "研发管理员",
  annotation_manager: "标注管理员",
  reviewer: "审核员",
  annotator: "标注员",
};

export const statusLabels: Record<string, string> = {
  available: "待领取",
  annotation_assigned: "已指派标注",
  annotating: "标注中",
  review_pending: "待审核",
  review_assigned: "已指派审核",
  reviewing: "审核中",
  changes_requested: "退回修改",
  completed: "已完成",
  cancelled: "已取消",
  draft: "草稿",
  published: "已发布",
  closed: "已关闭",
  pending: "等待导入",
  importing: "导入中",
  ready: "就绪",
  failed: "失败",
};

