import { useState } from "react";
import type { Key } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Select, Table, Tag, message } from "antd";
import { useParams } from "react-router-dom";
import { useShell } from "../../app/shellContext";
import { ApiError } from "../../shared/api/client";
import type { TaskItem } from "../../shared/api/types";
import { statusLabels } from "../../shared/constants/labels";
import { queryKeys } from "../../shared/queryKeys";
import { PageHeading } from "../../shared/ui/PageHeading";
import { taskPackagesApi } from "./api";
import { usersApi } from "../users/api";

export function PackageItemsPage() {
  const { packageId = "" } = useParams();
  const { user } = useShell();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Key[]>([]);
  const [stage, setStage] = useState<"annotation" | "review">("annotation");
  const [assignee, setAssignee] = useState<string>();
  const { data = [] } = useQuery({
    queryKey: queryKeys.packageItems(packageId),
    queryFn: () => taskPackagesApi.items(packageId),
    enabled: !!packageId,
  });
  const { data: users = [] } = useQuery({
    queryKey: queryKeys.users,
    queryFn: usersApi.list,
  });
  const assignableUsers = taskPackagesApi.usersForStage(users, stage);
  const assign = useMutation({
    mutationFn: () =>
      taskPackagesApi.assign(packageId, {
        item_ids: selected.map(String),
        assignee_id: assignee as string,
        stage,
      }),
    onSuccess: () => {
      message.success("指派完成");
      setSelected([]);
      void queryClient.invalidateQueries({ queryKey: queryKeys.packageItems(packageId) });
    },
    onError: (error: ApiError) => message.error(error.message),
  });
  const reclaim = useMutation({
    mutationFn: taskPackagesApi.reclaim,
    onSuccess: () => {
      message.success("任务已回收");
      void queryClient.invalidateQueries({ queryKey: queryKeys.packageItems(packageId) });
    },
    onError: (error: ApiError) => message.error(error.message),
  });
  const reclaimable = [
    "annotation_assigned",
    "annotating",
    "changes_requested",
    "review_assigned",
    "reviewing",
  ];
  const canManage = user.role === "developer_admin" || user.role === "annotation_manager";

  return (
    <>
      <PageHeading title="任务条目" subtitle="选择待处理条目后可批量指派，已领取条目可手动回收" />
      <div className="toolbar">
        <Select
          value={stage}
          onChange={(value: "annotation" | "review") => {
            setStage(value);
            setAssignee(undefined);
            setSelected([]);
          }}
          style={{ width: 130 }}
          options={[
            { value: "annotation", label: "标注阶段" },
            { value: "review", label: "审核阶段" },
          ]}
        />
        <Select
          value={assignee}
          onChange={setAssignee}
          placeholder="选择人员"
          style={{ width: 220 }}
          options={assignableUsers.map((candidate) => ({
            value: candidate.id,
            label: candidate.display_name,
          }))}
        />
        <Button
          type="primary"
          disabled={!selected.length || !assignee}
          loading={assign.isPending}
          onClick={() => assign.mutate()}
        >
          批量指派 ({selected.length})
        </Button>
      </div>
      <div className="table-panel">
        <Table<TaskItem>
          rowKey="id"
          rowSelection={
            canManage
              ? {
                  selectedRowKeys: selected,
                  onChange: setSelected,
                  getCheckboxProps: (row: TaskItem) => ({
                    disabled:
                      stage === "annotation"
                        ? row.status !== "available"
                        : row.status !== "review_pending",
                  }),
                }
              : undefined
          }
          dataSource={data}
          columns={[
            { title: "顺序", dataIndex: "claim_order" },
            { title: "条目", dataIndex: "id", render: (value: string) => value.slice(0, 8) },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: string) => <Tag>{statusLabels[value] || value}</Tag>,
            },
            {
              title: "标注员",
              dataIndex: "annotator_id",
              render: (value: string | null) => value?.slice(0, 8) || "-",
            },
            {
              title: "审核员",
              dataIndex: "reviewer_id",
              render: (value: string | null) => value?.slice(0, 8) || "-",
            },
            {
              title: "操作",
              render: (_, row) =>
                canManage && reclaimable.includes(row.status) ? (
                  <Button size="small" danger onClick={() => reclaim.mutate(row.id)}>
                    回收
                  </Button>
                ) : (
                  "-"
                ),
            },
          ]}
        />
      </div>
    </>
  );
}
