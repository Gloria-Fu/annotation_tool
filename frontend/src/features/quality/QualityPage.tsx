import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { Eye, History, Shuffle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useShell } from "../../app/shellContext";
import type { QualitySample, TaskPackage, User } from "../../shared/api/types";
import { queryKeys } from "../../shared/queryKeys";
import { PageHeading } from "../../shared/ui/PageHeading";
import { statusLabels } from "../../shared/constants/labels";
import { taskPackagesApi } from "../task-packages/api";
import { usersApi } from "../users/api";
import { qualityApi } from "./api";

type SamplingMode = "all" | "ratio" | "count";

function modeLabel(mode: string): string {
  if (mode === "ratio") return "按比例";
  if (mode === "count") return "按数量";
  return "全部";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请稍后重试";
}

export function QualityPage() {
  const { projectId, user } = useShell();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [packageId, setPackageId] = useState<string>();
  const [selectedBatchId, setSelectedBatchId] = useState<string>();
  const [samplingMode, setSamplingMode] = useState<SamplingMode>("ratio");
  const [samplePercent, setSamplePercent] = useState(10);
  const [sampleCount, setSampleCount] = useState(20);
  const [sampleSeed, setSampleSeed] = useState("quality");
  const [onlyUnchecked, setOnlyUnchecked] = useState(true);
  const [assigneeId, setAssigneeId] = useState<string>();
  const [pendingReject, setPendingReject] = useState<QualitySample>();
  const [rejectComment, setRejectComment] = useState("");
  const [historyItem, setHistoryItem] = useState<QualitySample>();
  const [createFailure, setCreateFailure] = useState<string | null>(null);

  const { data: packages = [] } = useQuery({
    queryKey: queryKeys.packages(projectId),
    queryFn: () => taskPackagesApi.list(projectId as string),
    enabled: !!projectId,
  });
  const { data: batches = [] } = useQuery({
    queryKey: queryKeys.qualityBatches(projectId),
    queryFn: () => qualityApi.batches(projectId as string),
    enabled: !!projectId,
  });
  const canManage = user.role === "developer_admin" || user.role === "annotation_manager";
  const { data: users = [] } = useQuery({
    queryKey: queryKeys.users,
    queryFn: usersApi.list,
    enabled: canManage,
  });
  const { data: batch, isLoading: batchLoading } = useQuery({
    queryKey: selectedBatchId
      ? queryKeys.qualityBatch(selectedBatchId)
      : queryKeys.qualityBatch("empty"),
    queryFn: () => qualityApi.batch(selectedBatchId as string),
    enabled: !!selectedBatchId,
  });
  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: historyItem
      ? queryKeys.qualityHistory(historyItem.task_item_id)
      : queryKeys.qualityHistory("empty"),
    queryFn: () => qualityApi.history(historyItem?.task_item_id as string),
    enabled: !!historyItem,
  });
  const create = useMutation({
    onMutate: () => setCreateFailure(null),
    mutationFn: () =>
      qualityApi.createBatch({
        package_id: packageId as string,
        assignee_id: assigneeId,
        mode: samplingMode,
        percent: samplePercent,
        count: sampleCount,
        seed: sampleSeed.trim() || "quality",
        only_unchecked: onlyUnchecked,
      }),
    onSuccess: (created) => {
      setSelectedBatchId(created.id);
      message.success(`已生成 ${created.total_samples} 条抽检清单`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.qualityBatches(projectId) });
    },
    onError: (error: unknown) => setCreateFailure(errorMessage(error)),
  });
  const check = useMutation({
    mutationFn: ({
      sample,
      result,
      comment,
    }: {
      sample: QualitySample;
      result: "passed" | "rejected";
      comment?: string;
    }) => qualityApi.check(sample.batch_id, sample.task_item_id, result, comment),
    onSuccess: () => {
      setPendingReject(undefined);
      setRejectComment("");
      message.success("抽检结果已记录");
      if (selectedBatchId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.qualityBatch(selectedBatchId) });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.qualityBatches(projectId) });
    },
    onError: (error: unknown) => message.error(errorMessage(error)),
  });

  const visibleBatches = packageId
    ? batches.filter((entry) => entry.package_id === packageId)
    : batches;
  const selectedPackage = packages.find((entry) => entry.id === packageId);
  const createDisabledReason =
    !packageId || !canManage
      ? null
      : selectedPackage && selectedPackage.reviewed_items <= 0
        ? "所选任务包暂无已审核完成任务，不能生成抽检清单"
        : null;
  const selectedSamples = batch?.samples || [];

  return (
    <>
      <PageHeading title="质量抽检" subtitle="抽检批次、样本和标注版本均会保存，可随时复盘" />
      <div className="toolbar">
        <Select
          value={packageId}
          onChange={(value) => {
            setPackageId(value);
            setSelectedBatchId(undefined);
            setCreateFailure(null);
          }}
          placeholder="选择任务包"
          style={{ width: 280 }}
          options={packages.map((item: TaskPackage) => ({ value: item.id, label: item.title }))}
        />
        <Select<SamplingMode>
          value={samplingMode}
          onChange={setSamplingMode}
          style={{ width: 132 }}
          options={[
            { value: "ratio", label: "按比例抽检" },
            { value: "count", label: "按数量抽检" },
            { value: "all", label: "全部抽检" },
          ]}
        />
        {samplingMode === "ratio" && (
          <InputNumber
            min={1}
            max={100}
            addonAfter="%"
            value={samplePercent}
            onChange={(value) => setSamplePercent(value ?? 10)}
          />
        )}
        {samplingMode === "count" && (
          <InputNumber
            min={1}
            max={10000}
            addonBefore="数量"
            value={sampleCount}
            onChange={(value) => setSampleCount(value ?? 20)}
          />
        )}
        {samplingMode !== "all" && (
          <Input
            value={sampleSeed}
            onChange={(event) => setSampleSeed(event.target.value)}
            placeholder="随机种子"
            style={{ width: 140 }}
          />
        )}
        <Checkbox
          checked={onlyUnchecked}
          onChange={(event) => setOnlyUnchecked(event.target.checked)}
        >
          仅未抽检
        </Checkbox>
        {canManage && (
          <Select
            value={assigneeId}
            onChange={setAssigneeId}
            placeholder="抽检负责人（默认自己）"
            style={{ width: 190 }}
            options={users
              .filter((candidate: User) =>
                ["developer_admin", "annotation_manager"].includes(candidate.role),
              )
              .map((candidate: User) => ({
                value: candidate.id,
                label: candidate.display_name,
              }))}
          />
        )}
        <Button
          type="primary"
          icon={<Shuffle size={15} />}
          disabled={!packageId || !canManage || !!createDisabledReason}
          loading={create.isPending}
          onClick={() => create.mutate()}
        >
          生成抽检清单
        </Button>
        {createDisabledReason && (
          <Typography.Text type="warning">{createDisabledReason}</Typography.Text>
        )}
      </div>

      <div className="quality-summary" aria-label="抽检概览">
        <Typography.Text>当前批次样本 {batch?.total_samples ?? 0}</Typography.Text>
        <Typography.Text>已完成 {batch?.checked_samples ?? 0}</Typography.Text>
        <Typography.Text>通过 {batch?.passed_samples ?? 0}</Typography.Text>
        <Typography.Text>退回 {batch?.rejected_samples ?? 0}</Typography.Text>
      </div>

      <div className="table-panel">
        <Typography.Title level={5}>历史抽检批次</Typography.Title>
        <Table
          rowKey="id"
          size="small"
          dataSource={visibleBatches}
          pagination={{ pageSize: 5 }}
          locale={{ emptyText: packageId ? "暂无历史批次" : "请先选择任务包" }}
          columns={[
            {
              title: "创建时间",
              dataIndex: "created_at",
              render: (value: string) => new Date(value).toLocaleString(),
            },
            {
              title: "规则",
              render: (_, row) =>
                `${modeLabel(row.mode)}${row.mode === "ratio" ? ` ${row.sample_percent}%` : row.mode === "count" ? ` ${row.sample_count} 条` : ""}`,
            },
            { title: "随机种子", dataIndex: "seed" },
            {
              title: "负责人",
              dataIndex: "assignee_id",
              render: (value: string | null) => value?.slice(0, 8) || "创建人",
            },
            {
              title: "进度",
              render: (_, row) => `${row.checked_samples} / ${row.total_samples}`,
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: string) => (
                <Tag color={value === "completed" ? "green" : "blue"}>
                  {value === "completed" ? "已完成" : "进行中"}
                </Tag>
              ),
            },
            {
              title: "操作",
              render: (_, row) => (
                <Button size="small" onClick={() => setSelectedBatchId(row.id)}>
                  查看批次
                </Button>
              ),
            },
          ]}
        />
      </div>

      <div className="table-panel">
        <Typography.Title level={5}>
          {batch ? `抽检清单 · ${batch.id.slice(0, 8)}` : "抽检清单"}
        </Typography.Title>
        <Table<QualitySample>
          rowKey="id"
          dataSource={selectedSamples}
          loading={batchLoading}
          locale={{
            emptyText: packageId ? "请生成或选择抽检批次" : "请先选择任务包",
          }}
          columns={[
            {
              title: "顺序",
              dataIndex: "sample_order",
              width: 80,
              render: (value: number) => value + 1,
            },
            {
              title: "Episode",
              dataIndex: ["item", "claim_order"],
              width: 100,
              render: (value: number) => value + 1,
            },
            {
              title: "任务",
              dataIndex: "task_item_id",
              render: (value: string) => value.slice(0, 8),
            },
            {
              title: "抽检结果",
              render: (_, row) => {
                const result = row.latest_check?.result || row.item.qa_status;
                return (
                  <Tag
                    color={
                      result === "passed" ? "green" : result === "rejected" ? "red" : "default"
                    }
                  >
                    {statusLabels[result] || result}
                  </Tag>
                );
              },
            },
            {
              title: "检查版本",
              render: (_, row) =>
                row.latest_check?.revision_version
                  ? `v${row.latest_check.revision_version}`
                  : "未检查",
            },
            {
              title: "操作",
              render: (_, row) => (
                <Space>
                  <Button
                    size="small"
                    icon={<Eye size={14} />}
                    onClick={() => void navigate(`/work/${row.task_item_id}`)}
                  >
                    查看
                  </Button>
                  <Button
                    size="small"
                    icon={<History size={14} />}
                    onClick={() => setHistoryItem(row)}
                  >
                    历史
                  </Button>
                  {!row.latest_check && batch?.status === "open" && (
                    <>
                      <Button
                        size="small"
                        loading={check.isPending}
                        onClick={() => check.mutate({ sample: row, result: "passed" })}
                      >
                        通过
                      </Button>
                      <Button
                        size="small"
                        danger
                        loading={check.isPending}
                        onClick={() => {
                          setRejectComment("");
                          setPendingReject(row);
                        }}
                      >
                        退回
                      </Button>
                    </>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </div>

      <Modal
        open={!!createFailure}
        title="生成抽检清单失败"
        okText="知道了"
        cancelButtonProps={{ style: { display: "none" } }}
        onOk={() => setCreateFailure(null)}
        onCancel={() => setCreateFailure(null)}
      >
        <Typography.Paragraph>{createFailure}</Typography.Paragraph>
      </Modal>

      <Modal
        open={!!pendingReject}
        title="填写抽检退回原因"
        okText="确认退回"
        cancelText="取消"
        okButtonProps={{ danger: true, disabled: !rejectComment.trim() }}
        confirmLoading={check.isPending}
        onOk={() => {
          if (pendingReject && rejectComment.trim()) {
            check.mutate({
              sample: pendingReject,
              result: "rejected",
              comment: rejectComment.trim(),
            });
          }
        }}
        onCancel={() => {
          if (!check.isPending) setPendingReject(undefined);
        }}
      >
        <Input.TextArea
          rows={4}
          value={rejectComment}
          placeholder="请说明需要返工的问题"
          onChange={(event) => setRejectComment(event.target.value)}
        />
      </Modal>

      <Modal
        open={!!historyItem}
        title={historyItem ? `质量历史 · ${historyItem.task_item_id.slice(0, 8)}` : undefined}
        footer={null}
        width={760}
        onCancel={() => setHistoryItem(undefined)}
      >
        <Table
          rowKey="id"
          size="small"
          loading={historyLoading}
          dataSource={history}
          pagination={false}
          locale={{ emptyText: "暂无质量抽检记录" }}
          columns={[
            {
              title: "时间",
              dataIndex: "created_at",
              render: (value: string) => new Date(value).toLocaleString(),
            },
            {
              title: "批次",
              dataIndex: "batch_id",
              render: (value: string | null) => value?.slice(0, 8) || "历史记录",
            },
            {
              title: "结果",
              dataIndex: "result",
              render: (value: string) => statusLabels[value] || value,
            },
            {
              title: "版本",
              dataIndex: "revision_version",
              render: (value: number | null) => (value ? `v${value}` : "-"),
            },
            {
              title: "原因/备注",
              dataIndex: "comment",
              render: (value: string | null) => value || "-",
            },
          ]}
        />
      </Modal>
    </>
  );
}
