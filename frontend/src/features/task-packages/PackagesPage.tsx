import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from "antd";
import { Boxes, Play, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useShell } from "../../app/AppShell";
import { ApiError } from "../../shared/api/client";
import type { Dataset, TaskPackage, User } from "../../shared/api/types";
import { roleLabels, statusLabels } from "../../shared/constants/labels";
import { queryKeys } from "../../shared/queryKeys";
import { PageHeading } from "../../shared/ui/PageHeading";
import { datasetsApi } from "../datasets/api";
import { usersApi } from "../users/api";
import { taskPackagesApi, type PackageInput } from "./api";

type PackageFormValues = Omit<PackageInput, "project_id">;

export function PackagesPage() {
  const { user, projectId } = useShell();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: packages = [] } = useQuery({
    queryKey: queryKeys.packages(projectId),
    queryFn: () => taskPackagesApi.list(projectId as string),
    enabled: !!projectId,
  });
  const isManager = user.role === "developer_admin" || user.role === "annotation_manager";
  const { data: datasets = [] } = useQuery({
    queryKey: queryKeys.datasets(projectId),
    queryFn: () => datasetsApi.list(projectId as string),
    enabled: !!projectId && isManager,
  });
  const { data: users = [] } = useQuery({
    queryKey: queryKeys.users,
    queryFn: usersApi.list,
    enabled: isManager,
  });
  const create = useMutation({
    mutationFn: (values: PackageFormValues) =>
      taskPackagesApi.create({ ...values, project_id: projectId as string }),
    onSuccess: () => {
      message.success("任务包已创建");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.packages(projectId) });
    },
    onError: (error: ApiError) => message.error(error.message),
  });
  const publish = useMutation({
    mutationFn: taskPackagesApi.publish,
    onSuccess: () => {
      message.success("已发布");
      void queryClient.invalidateQueries({ queryKey: queryKeys.packages(projectId) });
    },
    onError: (error: ApiError) => message.error(error.message),
  });
  const claim = useMutation({
    mutationFn: ({ id, review }: { id: string; review: boolean }) =>
      taskPackagesApi.claim(id, review),
    onSuccess: (item) => navigate(`/work/${item.id}`),
    onError: (error: ApiError) => message.error(error.message),
  });
  const isReview = user.role === "reviewer";

  return (
    <>
      <PageHeading
        title="任务包"
        subtitle="每个任务条目对应一个 LeRobot episode"
        action={
          isManager ? (
            <Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
              创建任务包
            </Button>
          ) : undefined
        }
      />
      <div className="table-panel">
        <Table<TaskPackage>
          rowKey="id"
          dataSource={packages}
          columns={[
            { title: "标题", dataIndex: "title" },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: string) => (
                <Tag color={value === "published" ? "green" : "default"}>
                  {statusLabels[value] || value}
                </Tag>
              ),
            },
            {
              title: "发放",
              dataIndex: "claim_policy",
              render: (value: string) => (value === "random" ? "随机" : "顺序"),
            },
            {
              title: "操作",
              render: (_, row) => (
                <Space>
                  {isManager && row.status === "draft" && (
                    <Button size="small" onClick={() => publish.mutate(row.id)}>
                      发布
                    </Button>
                  )}
                  {row.status === "published" && user.role !== "developer_admin" && (
                    <Button
                      type="primary"
                      size="small"
                      icon={<Play size={14} />}
                      onClick={() => claim.mutate({ id: row.id, review: isReview })}
                    >
                      领取{isReview ? "审核" : "标注"}
                    </Button>
                  )}
                  {isManager && (
                    <Button size="small" icon={<Boxes size={14} />} onClick={() => void navigate(`/packages/${row.id}`)}>
                      管理条目
                    </Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </div>
      <Modal open={open} title="创建任务包" footer={null} onCancel={() => setOpen(false)}>
        <Form<PackageFormValues>
          layout="vertical"
          initialValues={{ claim_policy: "sequential" }}
          onFinish={(values) => create.mutate(values)}
        >
          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="dataset_id" label="数据集" rules={[{ required: true }]}>
            <Select
              options={datasets
                .filter((dataset) => dataset.status === "ready")
                .map((dataset: Dataset) => ({
                  value: dataset.id,
                  label: `${dataset.name} (${dataset.episode_count})`,
                }))}
            />
          </Form.Item>
          <Form.Item name="claim_policy" label="领取顺序">
            <Select
              options={[
                { value: "sequential", label: "按 episode 顺序" },
                { value: "random", label: "固定随机顺序" },
              ]}
            />
          </Form.Item>
          <Form.Item name="member_ids" label="成员范围">
            <Select
              mode="multiple"
              placeholder="留空表示项目内所有成员"
              options={users
                .filter((candidate: User) => ["annotator", "reviewer"].includes(candidate.role))
                .map((candidate: User) => ({
                  value: candidate.id,
                  label: `${candidate.display_name} · ${roleLabels[candidate.role]}`,
                }))}
            />
          </Form.Item>
          <Space>
            <Form.Item name="episode_start" label="起始 episode">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="episode_end" label="结束 episode">
              <InputNumber min={0} />
            </Form.Item>
          </Space>
          <Button type="primary" htmlType="submit" loading={create.isPending}>
            创建草稿
          </Button>
        </Form>
      </Modal>
    </>
  );
}
