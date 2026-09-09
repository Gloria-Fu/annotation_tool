import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Table } from "antd";
import { Download } from "lucide-react";
import { dashboardApi } from "./api";
import { useShell } from "../../app/shellContext";
import { PageHeading } from "../../shared/ui/PageHeading";
import { queryKeys } from "../../shared/queryKeys";

export function DashboardPage() {
  const { projectId } = useShell();
  const { data, isLoading } = useQuery({
    queryKey: projectId ? queryKeys.stats(projectId) : ["stats", "empty"],
    queryFn: () => dashboardApi.stats(projectId as string),
    enabled: !!projectId,
  });

  if (!projectId) return <Alert type="info" message="请先创建或选择项目" />;
  const pending = (data?.by_status.available || 0) + (data?.by_status.annotation_assigned || 0);
  const reviewing =
    (data?.by_status.review_pending || 0) +
    (data?.by_status.review_assigned || 0) +
    (data?.by_status.reviewing || 0);

  return (
    <>
      <PageHeading
        title="进度看板"
        subtitle="项目任务状态与人员完成情况"
        action={
          <Button icon={<Download size={16} />} href={dashboardApi.reportUrl(projectId)}>
            导出报表
          </Button>
        }
      />
      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">任务总数</div>
          <div className="metric-value">{isLoading ? "-" : data?.total || 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">待标注</div>
          <div className="metric-value">{pending}</div>
        </div>
        <div className="metric">
          <div className="metric-label">审核队列</div>
          <div className="metric-value">{reviewing}</div>
        </div>
        <div className="metric">
          <div className="metric-label">完成率</div>
          <div className="metric-value">{Math.round((data?.completion_rate || 0) * 100)}%</div>
        </div>
      </div>
      <div className="table-panel">
        <Table
          rowKey="user_id"
          pagination={false}
          dataSource={data?.by_person || []}
          columns={[
            { title: "人员", dataIndex: "display_name" },
            { title: "完成条目", dataIndex: "completed" },
          ]}
        />
      </div>
    </>
  );
}
