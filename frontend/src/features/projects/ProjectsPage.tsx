import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Form, Input, Modal, Table, Tag } from "antd";
import { Plus } from "lucide-react";
import { ApiError } from "../../shared/api/client";
import type { Project } from "../../shared/api/types";
import { queryKeys } from "../../shared/queryKeys";
import { PageHeading } from "../../shared/ui/PageHeading";
import { projectsApi, type ProjectInput } from "./api";

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<ProjectInput>();
  const { data = [] } = useQuery({
    queryKey: queryKeys.projects,
    queryFn: projectsApi.list,
  });
  const create = useMutation({
    mutationFn: (input: ProjectInput) => projectsApi.create(input),
    onSuccess: () => {
      setOpen(false);
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
    onError: (error: ApiError) => window.alert(error.message),
  });

  return (
    <>
      <PageHeading
        title="项目管理"
        action={
          <Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
            新建项目
          </Button>
        }
      />
      <div className="table-panel">
        <Table<Project>
          rowKey="id"
          dataSource={data}
          columns={[
            { title: "项目名称", dataIndex: "name" },
            {
              title: "说明",
              dataIndex: "description",
              render: (value: Project["description"]) => value || "-",
            },
            { title: "状态", render: () => <Tag color="green">启用</Tag> },
          ]}
        />
      </div>
      <Modal open={open} title="新建项目" footer={null} onCancel={() => setOpen(false)}>
        <Form<ProjectInput>
          form={form}
          layout="vertical"
          onFinish={(values) => create.mutate(values)}
        >
          <Form.Item name="name" label="项目名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={create.isPending}>
            创建
          </Button>
        </Form>
      </Modal>
    </>
  );
}
