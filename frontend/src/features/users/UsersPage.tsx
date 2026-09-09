import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message } from "antd";
import { Plus } from "lucide-react";
import { useShell } from "../../app/shellContext";
import { ApiError } from "../../shared/api/client";
import type { Role, User } from "../../shared/api/types";
import { roleLabels } from "../../shared/constants/labels";
import { queryKeys } from "../../shared/queryKeys";
import { PageHeading } from "../../shared/ui/PageHeading";
import { usersApi, type UserInput } from "./api";

type UserFormInput = Omit<UserInput, "project_ids"> & { project_ids?: string[] };

export function UsersPage() {
  const { user, projects, projectId } = useShell();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const { data = [] } = useQuery({ queryKey: queryKeys.users, queryFn: usersApi.list });
  const create = useMutation({
    mutationFn: (input: UserFormInput) =>
      usersApi.create({
        ...input,
        project_ids: input.project_ids || (projectId ? [projectId] : []),
      }),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
    onError: (error: ApiError) => message.error(error.message),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      usersApi.update(id, { is_active: active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.users }),
    onError: (error: ApiError) => message.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => {
      message.success("账号已删除");
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
    onError: (error: ApiError) => message.error(error.message),
  });
  const roles: { value: Role; label: string }[] =
    user.role === "developer_admin"
      ? (Object.entries(roleLabels) as [Role, string][]).map(([value, label]) => ({ value, label }))
      : [
          { value: "annotator", label: roleLabels.annotator },
          { value: "reviewer", label: roleLabels.reviewer },
        ];

  return (
    <>
      <PageHeading
        title="账号与人员"
        action={
          <Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
            创建账号
          </Button>
        }
      />
      <div className="table-panel">
        <Table<User>
          rowKey="id"
          dataSource={data}
          columns={[
            { title: "用户名", dataIndex: "username" },
            { title: "姓名", dataIndex: "display_name" },
            {
              title: "角色",
              dataIndex: "role",
              render: (value: Role) => roleLabels[value],
            },
            {
              title: "状态",
              dataIndex: "is_active",
              render: (value: boolean) => (
                <Tag color={value ? "green" : "default"}>{value ? "启用" : "停用"}</Tag>
              ),
            },
            {
              title: "操作",
              render: (_, row) => (
                <Space>
                  <Button
                    size="small"
                    disabled={row.id === user.id}
                    onClick={() => toggle.mutate({ id: row.id, active: !row.is_active })}
                  >
                    {row.is_active ? "停用" : "启用"}
                  </Button>
                  <Button
                    size="small"
                    danger
                    onClick={() => {
                      if (row.id === user.id) {
                        message.warning("不能删除当前登录账号");
                        return;
                      }
                      setDeleteTarget(row);
                    }}
                  >
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </div>
      <Modal open={open} title="创建账号" footer={null} onCancel={() => setOpen(false)}>
        <Form<UserFormInput>
          layout="vertical"
          initialValues={{ role: "annotator", project_ids: projectId ? [projectId] : [] }}
          onFinish={(values) => create.mutate(values)}
        >
          <Form.Item name="username" label="用户名" rules={[{ required: true, min: 3 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="display_name" label="姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 10 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Select options={roles} />
          </Form.Item>
          <Form.Item name="project_ids" label="所属项目">
            <Select
              mode="multiple"
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={create.isPending}>
            创建
          </Button>
        </Form>
      </Modal>
      <Modal
        open={!!deleteTarget}
        title={deleteTarget ? `删除账号 ${deleteTarget.username}？` : "删除账号"}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        confirmLoading={remove.isPending}
        onCancel={() => setDeleteTarget(null)}
        onOk={() => {
          if (!deleteTarget) return;
          void remove.mutateAsync(deleteTarget.id).then(() => setDeleteTarget(null));
        }}
      >
        <p>账号会立即停用并从管理列表隐藏，历史任务和审计记录会保留。</p>
      </Modal>
    </>
  );
}
