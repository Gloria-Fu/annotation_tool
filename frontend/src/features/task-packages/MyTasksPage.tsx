import { useQuery } from "@tanstack/react-query";
import { Button, Table, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import { taskPackagesApi } from "./api";
import { PageHeading } from "../../shared/ui/PageHeading";
import { queryKeys } from "../../shared/queryKeys";
import { statusLabels } from "../../shared/constants/labels";
import type { TaskItem } from "../../shared/api/types";

export function MyTasksPage({ review = false }: { review?: boolean }) {
  const navigate = useNavigate();
  const { data = [] } = useQuery({
    queryKey: queryKeys.myTasks(review),
    queryFn: () => taskPackagesApi.myTasks(review),
  });

  return (
    <>
      <PageHeading title={review ? "我的审核" : "我的标注"} />
      <div className="table-panel">
        <Table<TaskItem>
          rowKey="id"
          dataSource={data}
          columns={[
            { title: "任务编号", dataIndex: "id", render: (value: string) => value.slice(0, 8) },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: string) => <Tag>{statusLabels[value] || value}</Tag>,
            },
            {
              title: "操作",
              render: (_, row) => (
                <Button type="primary" size="small" onClick={() => void navigate(`/work/${row.id}`)}>
                  打开工作台
                </Button>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
