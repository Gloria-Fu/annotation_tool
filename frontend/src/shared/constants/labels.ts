import type { Role } from "../api/types";

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
