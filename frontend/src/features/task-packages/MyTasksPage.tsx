import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Empty, Tabs, Table, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import { taskPackagesApi, type MyTaskView } from "./api";
import { PageHeading } from "../../shared/ui/PageHeading";
import { queryKeys } from "../../shared/queryKeys";
import { statusLabels } from "../../shared/constants/labels";
import type { TaskItem } from "../../shared/api/types";

export function MyTasksPage({ review = false }: { review?: boolean }) {
  const navigate = useNavigate();
  const [view, setView] = useState<MyTaskView>("pending");
  const { data = [], isLoading } = useQuery({
    queryKey: queryKeys.myTasks(review, view),
    queryFn: () => taskPackagesApi.myTasks(review, view),
  });

  return (
    <>
      <PageHeading title={review ? "我的审核" : "我的标注"} />
      <Tabs
        activeKey={view}
        onChange={(key) => setView(key as MyTaskView)}
        items={[
          { key: "pending", label: "待处理" },
          { key: "history", label: review ? "已审核" : "已提交" },
        ]}
      />
      <div className="table-panel">
        <Table<TaskItem>
          rowKey="id"
          dataSource={data}
          loading={isLoading}
          locale={{
            emptyText: (
              <Empty description={view === "pending" ? "暂无待处理任务" : "暂无历史记录"} />
            ),
          }}
          columns={[
            { title: "任务编号", dataIndex: "id", render: (value: string) => value.slice(0, 8) },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: string) => <Tag>{statusLabels[value] || value}</Tag>,
            },
            {
              title: "操作",
              render: (_, row) =>
                view === "pending" ? (
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => void navigate(`/work/${row.id}`)}
                  >
                    打开工作台
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
