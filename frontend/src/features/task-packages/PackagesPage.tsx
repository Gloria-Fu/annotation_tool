import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  message,
} from "antd";
import { Boxes, Play, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useShell } from "../../app/shellContext";
import { ApiError } from "../../shared/api/client";
import type { Dataset, TaskPackage } from "../../shared/api/types";
import { statusLabels } from "../../shared/constants/labels";
import { queryKeys } from "../../shared/queryKeys";
import { PageHeading } from "../../shared/ui/PageHeading";
import { datasetsApi } from "../datasets/api";
import { taskPackagesApi, type PackageInput } from "./api";
import { claimFailureMessage, claimFailureTitle } from "./claimFailure";

type PackageFormValues = Omit<PackageInput, "project_id">;

export function PackagesPage() {
  const { user, projectId } = useShell();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [claimFailure, setClaimFailure] = useState<{
    review: boolean;
    message: string;
  } | null>(null);
  const [reviewClaimTarget, setReviewClaimTarget] = useState<TaskPackage | null>(null);
  const [reviewClaimPolicy, setReviewClaimPolicy] = useState<"sequential" | "random">("sequential");
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
    mutationFn: ({
      id,
      review,
      claimPolicy,
    }: {
      id: string;
      review: boolean;
      claimPolicy?: "sequential" | "random";
    }) => taskPackagesApi.claim(id, review, claimPolicy),
    onSuccess: (item) => {
      setReviewClaimTarget(null);
      void navigate(`/work/${item.id}`);
    },
    onError: (error: Error, variables) =>
      setClaimFailure({
        review: variables.review,
        message: claimFailureMessage(error),
      }),
  });
  const isReview = user.role === "reviewer";

  return (
    <>
      <PageHeading
        title="任务包"
        subtitle="每个任务条目对应一个 LeRobot episode，任务包权限由项目成员关系决定"
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
              title: "条目进度",
              render: (_, row) =>
                `总数 ${row.total_items} · 已领取 ${row.claimed_items} · 已标注 ${row.annotated_items} · 已审核 ${row.reviewed_items}`,
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
                      loading={claim.isPending}
                      onClick={() => {
                        if (isReview) {
                          setReviewClaimPolicy("sequential");
                          setReviewClaimTarget(row);
                        } else {
                          claim.mutate({ id: row.id, review: false });
                        }
                      }}
                    >
                      领取{isReview ? "审核" : "标注"}
                    </Button>
                  )}
                  {isManager && (
                    <Button
                      size="small"
                      icon={<Boxes size={14} />}
                      onClick={() => void navigate(`/packages/${row.id}`)}
                    >
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
      <Modal
        open={claimFailure !== null}
        title={claimFailure ? claimFailureTitle(claimFailure.review) : undefined}
        okText="知道了"
        onOk={() => setClaimFailure(null)}
        onCancel={() => setClaimFailure(null)}
      >
        {claimFailure?.message}
      </Modal>
      <Modal
        open={reviewClaimTarget !== null}
        title="选择审核领取方式"
        okText="开始领取"
        cancelText="取消"
        confirmLoading={claim.isPending}
        onOk={() => {
          if (reviewClaimTarget) {
            claim.mutate({
              id: reviewClaimTarget.id,
              review: true,
              claimPolicy: reviewClaimPolicy,
            });
          }
        }}
        onCancel={() => {
          if (!claim.isPending) setReviewClaimTarget(null);
        }}
      >
        <Segmented
          block
          value={reviewClaimPolicy}
          options={[
            { value: "sequential", label: "顺序抽检" },
            { value: "random", label: "随机抽检" },
          ]}
          onChange={(value) => {
            if (value === "sequential" || value === "random") setReviewClaimPolicy(value);
          }}
        />
      </Modal>
    </>
  );
}
