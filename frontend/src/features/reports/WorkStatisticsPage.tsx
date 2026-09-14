import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  DatePicker,
  Segmented,
  Select,
  Table,
  Tag,
  type TableColumnsType,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useShell } from "../../app/shellContext";
import type { Role, WorkMetric } from "../../shared/api/types";
import { roleLabels } from "../../shared/constants/labels";
import { queryKeys } from "../../shared/queryKeys";
import { PageHeading } from "../../shared/ui/PageHeading";
import { reportsApi, type Granularity, type WorkStatisticsQuery } from "./api";

const { RangePicker } = DatePicker;

type DateRange = [Dayjs, Dayjs];

const roleOptions: { value: Role; label: string }[] = [
  { value: "annotator", label: roleLabels.annotator },
  { value: "reviewer", label: roleLabels.reviewer },
];

function initialRange(): DateRange {
  const end = dayjs();
  return [end.startOf("month"), end];
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "-";
  if (seconds < 60) return `${Math.round(seconds)} 秒`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} 小时 ${remainingMinutes} 分钟` : `${hours} 小时`;
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function AnnotationMetricCards({ metric }: { metric: WorkMetric }) {
  return (
    <>
      <MetricCard label="领取任务" value={metric.claimed_count} />
      <MetricCard label="首次提交" value={metric.first_submissions} />
      <MetricCard label="重新提交" value={metric.resubmissions} />
      <MetricCard label="被退回" value={metric.returned_count} />
      <MetricCard label="最终通过" value={metric.final_approved_count} />
      <MetricCard label="一次通过率" value={formatPercent(metric.first_pass_rate)} />
      <MetricCard label="返工率" value={formatPercent(metric.rework_rate)} />
    </>
  );
}

function ReviewMetricCards({ metric }: { metric: WorkMetric }) {
  return (
    <>
      <MetricCard label="领取审核" value={metric.review_claimed_count} />
      <MetricCard label="审核总数" value={metric.review_count} />
      <MetricCard label="审核通过" value={metric.approved_count} />
      <MetricCard label="审核退回" value={metric.rejected_count} />
      <MetricCard label="审核通过率" value={formatPercent(metric.review_pass_rate)} />
      <MetricCard label="审核退回率" value={formatPercent(metric.review_return_rate)} />
      <MetricCard label="平均审核时长" value={formatDuration(metric.average_review_seconds)} />
    </>
  );
}

function annotationColumns(): TableColumnsType<WorkMetric> {
  return [
    { title: "领取", dataIndex: "claimed_count" },
    { title: "首次提交", dataIndex: "first_submissions" },
    { title: "重新提交", dataIndex: "resubmissions" },
    { title: "被退回", dataIndex: "returned_count" },
    { title: "最终通过", dataIndex: "final_approved_count" },
    {
      title: "一次通过率",
      dataIndex: "first_pass_rate",
      render: (value: number) => formatPercent(value),
    },
    {
      title: "返工率",
      dataIndex: "rework_rate",
      render: (value: number) => formatPercent(value),
    },
  ];
}

function reviewColumns(): TableColumnsType<WorkMetric> {
  return [
    { title: "领取审核", dataIndex: "review_claimed_count" },
    { title: "审核总数", dataIndex: "review_count" },
    { title: "通过", dataIndex: "approved_count" },
    { title: "退回", dataIndex: "rejected_count" },
    {
      title: "通过率",
      dataIndex: "review_pass_rate",
      render: (value: number) => formatPercent(value),
    },
    {
      title: "退回率",
      dataIndex: "review_return_rate",
      render: (value: number) => formatPercent(value),
    },
    {
      title: "平均审核时长",
      dataIndex: "average_review_seconds",
      render: (value: number | null) => formatDuration(value),
    },
  ];
}

function WorkFilters({
  range,
  onRangeChange,
  action,
}: {
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  action: ReactNode;
}) {
  return (
    <div className="stats-toolbar">
      <RangePicker
        value={range}
        allowClear={false}
        format="YYYY-MM-DD"
        onChange={(value) => {
          if (value?.[0] && value[1]) onRangeChange([value[0], value[1]]);
        }}
      />
      {action}
    </div>
  );
}

function PersonalWorkStatisticsPage() {
  const { user, projectId } = useShell();
  const [range, setRange] = useState<DateRange>(initialRange);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const query: WorkStatisticsQuery = {
    projectId,
    startDate: range[0].format("YYYY-MM-DD"),
    endDate: range[1].format("YYYY-MM-DD"),
    granularity,
  };
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.personalWork(projectId, query.startDate, query.endDate, granularity),
    queryFn: () => reportsApi.personal(query),
  });
  const periodsLatestFirst = useMemo(
    () =>
      [...(data?.periods ?? [])].sort((left, right) =>
        right.period_start.localeCompare(left.period_start),
      ),
    [data?.periods],
  );
  const showAnnotation = user.role !== "reviewer";
  const showReview = user.role !== "annotator";
  const columns = useMemo<TableColumnsType<WorkMetric>>(
    () => [
      {
        title: "周期",
        dataIndex: "period_start",
        render: (value: string, row) =>
          value === row.period_end ? value : `${value} 至 ${row.period_end}`,
      },
      {
        title: "去重有效视频时长",
        dataIndex: "effective_video_seconds",
        render: (value: number) => formatDuration(value),
      },
      ...(showAnnotation ? annotationColumns() : []),
      ...(showReview ? reviewColumns() : []),
    ],
    [showAnnotation, showReview],
  );

  if (error instanceof Error) return <Alert type="error" message={error.message} />;

  return (
    <>
      <PageHeading
        title="我的工作量"
        subtitle="按历史操作记录统计个人标注与审核贡献，日期按 UTC 归属"
        action={
          <Button icon={<Download size={16} />} href={reportsApi.personalCsvUrl(query)} download>
            导出 CSV
          </Button>
        }
      />
      <WorkFilters
        range={range}
        onRangeChange={setRange}
        action={
          <Segmented
            value={granularity}
            options={[
              { label: "按天", value: "day" },
              { label: "按周", value: "week" },
              { label: "按月", value: "month" },
            ]}
            onChange={(value) => setGranularity(value as Granularity)}
          />
        }
      />
      {data && (
        <>
          <div className="stats-section-heading">
            <h3>区间汇总</h3>
            <span>
              {data.start_date} 至 {data.end_date}
            </span>
          </div>
          <div className="metric-grid">
            <MetricCard
              label="去重有效视频时长"
              value={formatDuration(data.summary.effective_video_seconds)}
            />
            {showAnnotation && <AnnotationMetricCards metric={data.summary} />}
            {showReview && <ReviewMetricCards metric={data.summary} />}
          </div>
          <div className="stats-section-heading">
            <h3>
              {granularity === "day"
                ? "每日明细"
                : granularity === "week"
                  ? "每周明细"
                  : "每月明细"}
            </h3>
          </div>
          <div className="table-panel stats-table">
            <Table<WorkMetric>
              rowKey={(row) => `${row.user_id}-${row.period_start}`}
              loading={isLoading}
              dataSource={periodsLatestFirst}
              columns={columns}
              pagination={false}
              scroll={{ x: "max-content" }}
            />
          </div>
        </>
      )}
    </>
  );
}

function PeopleWorkStatisticsPage() {
  const { projectId } = useShell();
  const [range, setRange] = useState<DateRange>(initialRange);
  const [role, setRole] = useState<Role>();
  const query: WorkStatisticsQuery = {
    projectId,
    startDate: range[0].format("YYYY-MM-DD"),
    endDate: range[1].format("YYYY-MM-DD"),
    role,
  };
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.peopleWork(projectId, query.startDate, query.endDate, role),
    queryFn: () => reportsApi.people(query),
  });

  if (error instanceof Error) return <Alert type="error" message={error.message} />;

  const columns: TableColumnsType<WorkMetric> = [
    { title: "人员", dataIndex: "display_name" },
    {
      title: "角色",
      dataIndex: "role",
      render: (value: Role) => <Tag>{roleLabels[value]}</Tag>,
    },
    {
      title: "标注领取",
      dataIndex: "claimed_count",
    },
    {
      title: "首次提交",
      dataIndex: "first_submissions",
    },
    {
      title: "重提",
      dataIndex: "resubmissions",
    },
    {
      title: "被退回",
      dataIndex: "returned_count",
    },
    {
      title: "最终通过",
      dataIndex: "final_approved_count",
    },
    {
      title: "去重有效视频时长",
      dataIndex: "effective_video_seconds",
      render: (value: number) => formatDuration(value),
    },
    {
      title: "标注通过率",
      dataIndex: "first_pass_rate",
      render: (value: number) => formatPercent(value),
    },
    {
      title: "审核领取",
      dataIndex: "review_claimed_count",
    },
    {
      title: "审核总数",
      dataIndex: "review_count",
    },
    {
      title: "审核通过",
      dataIndex: "approved_count",
    },
    {
      title: "审核退回",
      dataIndex: "rejected_count",
    },
    {
      title: "审核通过率",
      dataIndex: "review_pass_rate",
      render: (value: number) => formatPercent(value),
    },
    {
      title: "审核退回率",
      dataIndex: "review_return_rate",
      render: (value: number) => formatPercent(value),
    },
    {
      title: "平均审核时长",
      dataIndex: "average_review_seconds",
      render: (value: number | null) => formatDuration(value),
    },
  ];

  return (
    <>
      <PageHeading
        title="人员工作量"
        subtitle="按项目、角色和时间范围查看历史工作贡献，日期按 UTC 归属"
        action={
          <Button icon={<Download size={16} />} href={reportsApi.peopleCsvUrl(query)} download>
            导出 CSV
          </Button>
        }
      />
      <WorkFilters
        range={range}
        onRangeChange={setRange}
        action={
          <Select
            allowClear
            value={role}
            placeholder="全部角色"
            style={{ width: 170 }}
            options={roleOptions}
            onChange={(value: Role | undefined) => setRole(value)}
          />
        }
      />
      {!projectId && <Alert type="info" message="当前按你有权限访问的全部项目汇总" showIcon />}
      <div className="table-panel stats-table">
        <Table<WorkMetric>
          rowKey="user_id"
          loading={isLoading}
          dataSource={data?.people || []}
          columns={columns}
          pagination={false}
          scroll={{ x: "max-content" }}
        />
      </div>
    </>
  );
}

export function WorkStatisticsPage() {
  const { user } = useShell();
  if (
    user.role === "developer_admin" ||
    user.role === "annotation_manager" ||
    user.role === "outsourcing_manager"
  ) {
    return <PeopleWorkStatisticsPage />;
  }
  return <PersonalWorkStatisticsPage />;
}

export function MyWorkStatisticsPage() {
  return <PersonalWorkStatisticsPage />;
}
