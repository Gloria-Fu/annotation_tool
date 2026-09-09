import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Select, Space, Table, message } from "antd";
import { useShell } from "../../app/shellContext";
import { ApiError } from "../../shared/api/client";
import type { TaskItem, TaskPackage } from "../../shared/api/types";
import { queryKeys } from "../../shared/queryKeys";
import { PageHeading } from "../../shared/ui/PageHeading";
import { statusLabels } from "../../shared/constants/labels";
import { taskPackagesApi } from "../task-packages/api";
import { qualityApi } from "./api";

export function QualityPage() {
  const { projectId } = useShell();
  const queryClient = useQueryClient();
  const [packageId, setPackageId] = useState<string>();
  const { data: packages = [] } = useQuery({
    queryKey: queryKeys.packages(projectId),
    queryFn: () => taskPackagesApi.list(projectId as string),
    enabled: !!projectId,
  });
  const { data: items = [] } = useQuery({
    queryKey: packageId ? queryKeys.qualityItems(packageId) : queryKeys.qualityItemsEmpty,
    queryFn: () => qualityApi.completedItems(packageId as string),
    enabled: !!packageId,
  });
  const check = useMutation({
    mutationFn: ({ id, result }: { id: string; result: "passed" | "rejected" }) =>
      qualityApi.check(id, result),
    onSuccess: () => {
      message.success("抽检结果已记录");
      void queryClient.invalidateQueries({ queryKey: queryKeys.qualityItemsRoot });
    },
    onError: (error: ApiError) => message.error(error.message),
  });

  return (
    <>
      <PageHeading title="质量抽检" />
      <div className="toolbar">
        <Select
          value={packageId}
          onChange={setPackageId}
          placeholder="选择任务包"
          style={{ width: 280 }}
          options={packages.map((item: TaskPackage) => ({ value: item.id, label: item.title }))}
        />
      </div>
      <div className="table-panel">
        <Table<TaskItem>
          rowKey="id"
          dataSource={items}
          columns={[
            { title: "条目", dataIndex: "id", render: (value: string) => value.slice(0, 8) },
            {
              title: "当前抽检",
              dataIndex: "qa_status",
              render: (value: string) => statusLabels[value] || value,
            },
            {
              title: "操作",
              render: (_, row) => (
                <Space>
                  <Button
                    size="small"
                    onClick={() => check.mutate({ id: row.id, result: "passed" })}
                  >
                    通过
                  </Button>
                  <Button
                    size="small"
                    danger
                    onClick={() => check.mutate({ id: row.id, result: "rejected" })}
                  >
                    退回
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
