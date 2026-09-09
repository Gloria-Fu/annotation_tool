import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Form, Input, Modal, Space, Table, Tag, message } from "antd";
import { Plus, RefreshCw } from "lucide-react";
import { useShell } from "../../app/shellContext";
import { ApiError } from "../../shared/api/client";
import type { Dataset } from "../../shared/api/types";
import { queryKeys } from "../../shared/queryKeys";
import { PageHeading } from "../../shared/ui/PageHeading";
import { datasetsApi, type DatasetInput } from "./api";
import { statusLabels } from "../../shared/constants/labels";

export function DatasetsPage() {
  const { projectId } = useShell();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data = [], refetch } = useQuery({
    queryKey: queryKeys.datasets(projectId),
    queryFn: () => datasetsApi.list(projectId as string),
    enabled: !!projectId,
    refetchInterval: 5000,
  });
  const create = useMutation({
    mutationFn: (input: Omit<DatasetInput, "project_id">) =>
      datasetsApi.create({ ...input, project_id: projectId as string }),
    onSuccess: () => {
      message.success("导入任务已创建");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
    onError: (error: ApiError) => message.error(error.message),
  });

  return (
    <>
      <PageHeading
        title="数据导入"
        subtitle="登记挂载的 LeRobot v2.1 目录（原始文件不修改）"
        action={
          <Space>
            <Button icon={<RefreshCw size={16} />} onClick={() => void refetch()} title="刷新" />
            <Button
              type="primary"
              icon={<Plus size={16} />}
              disabled={!projectId}
              onClick={() => setOpen(true)}
            >
              登记数据集
            </Button>
          </Space>
        }
      />
      <div className="table-panel">
        <Table<Dataset>
          rowKey="id"
          dataSource={data}
          columns={[
            { title: "名称", dataIndex: "name" },
            { title: "目录", dataIndex: "root_path", ellipsis: true },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: string) => (
                <Tag color={value === "ready" ? "green" : value === "failed" ? "red" : "blue"}>
                  {statusLabels[value] || value}
                </Tag>
              ),
            },
            { title: "Episodes", dataIndex: "episode_count" },
            { title: "警告", dataIndex: "warning_count" },
            { title: "错误", dataIndex: "error_message", ellipsis: true },
          ]}
        />
      </div>
      <Modal open={open} title="登记 LeRobot 数据集" footer={null} onCancel={() => setOpen(false)}>
        <Form<Omit<DatasetInput, "project_id">>
          layout="vertical"
          onFinish={(values) => create.mutate(values)}
        >
          <Form.Item name="name" label="数据集名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="root_path" label="容器内目录" rules={[{ required: true }]}>
            <Input placeholder="/datasets/agibot-episode0-v21_old" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={create.isPending}>
            开始导入
          </Button>
        </Form>
      </Modal>
    </>
  );
}
