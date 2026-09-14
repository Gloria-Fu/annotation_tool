import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message } from "antd";
import { Edit3, Plus, Trash2, UserPlus, UserRoundMinus } from "lucide-react";
import { useShell } from "../../app/shellContext";
import { ApiError } from "../../shared/api/client";
import type { Role, User, UserGroup } from "../../shared/api/types";
import { roleLabels } from "../../shared/constants/labels";
import { queryKeys } from "../../shared/queryKeys";
import { PageHeading } from "../../shared/ui/PageHeading";
import { usersApi } from "../users/api";
import { userGroupsApi, type UserGroupInput } from "./api";

type GroupFormValues = UserGroupInput;

export function UserGroupsPage() {
  const { user } = useShell();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null);
  const [memberGroup, setMemberGroup] = useState<UserGroup | null>(null);
  const [memberId, setMemberId] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<UserGroup | null>(null);
  const { data: groups = [], isLoading } = useQuery({
    queryKey: queryKeys.userGroups,
    queryFn: userGroupsApi.list,
    enabled: user.role === "developer_admin" || user.role === "outsourcing_manager",
  });
  const { data: users = [] } = useQuery({
    queryKey: queryKeys.users,
    queryFn: usersApi.list,
    enabled: user.role === "developer_admin",
  });
  const canAdministerGroups = user.role === "developer_admin";
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.userGroups });
  const save = useMutation({
    mutationFn: (values: GroupFormValues) =>
      editingGroup ? userGroupsApi.update(editingGroup.id, values) : userGroupsApi.create(values),
    onSuccess: () => {
      setFormOpen(false);
      setEditingGroup(null);
      refresh();
      message.success(editingGroup ? "群组已更新" : "群组已创建");
    },
    onError: (error: ApiError) => message.error(error.message),
  });
  const addMember = useMutation({
    mutationFn: () => userGroupsApi.addMember(memberGroup?.id as string, memberId as string),
    onSuccess: (updated) => {
      setMemberGroup(updated);
      setMemberId(undefined);
      refresh();
      message.success("成员已加入群组");
    },
    onError: (error: ApiError) => message.error(error.message),
  });
  const removeMember = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      userGroupsApi.removeMember(groupId, userId),
    onSuccess: (updated) => {
      setMemberGroup(updated);
      refresh();
      message.success("成员已移出群组");
    },
    onError: (error: ApiError) => message.error(error.message),
  });
  const removeGroup = useMutation({
    mutationFn: (groupId: string) => userGroupsApi.remove(groupId),
    onSuccess: () => {
      setDeleteTarget(null);
      refresh();
      message.success("群组已删除");
    },
    onError: (error: ApiError) => message.error(error.message),
  });

  return (
    <>
      <PageHeading
        title="人员群组"
        subtitle="先按组织或合作方整理人员，后续可将群组授权给任务包"
        action={
          canAdministerGroups ? (
            <Button
              type="primary"
              icon={<Plus size={16} />}
              onClick={() => {
                setEditingGroup(null);
                setFormOpen(true);
              }}
            >
              新建群组
            </Button>
          ) : undefined
        }
      />
      <div className="table-panel">
        <Table<UserGroup>
          rowKey="id"
          loading={isLoading}
          dataSource={groups}
          columns={[
            { title: "群组名称", dataIndex: "name" },
            { title: "说明", dataIndex: "description", ellipsis: true },
            {
              title: "负责人",
              dataIndex: "manager_id",
              render: (managerId: string | null) => {
                const manager = users.find((candidate) => candidate.id === managerId);
                return manager ? manager.display_name : managerId ? "外包负责人" : "未指定";
              },
            },
            { title: "成员数", dataIndex: "member_count" },
            {
              title: "成员",
              dataIndex: "members",
              render: (members: UserGroup["members"]) => (
                <Space wrap size={[4, 4]}>
                  {members.slice(0, 5).map((member) => (
                    <Tag key={member.id}>{member.display_name}</Tag>
                  ))}
                  {members.length > 5 && <Tag>+{members.length - 5}</Tag>}
                </Space>
              ),
            },
            {
              title: "操作",
              render: (_, row) => (
                <Space>
                  <Button
                    size="small"
                    icon={<UserPlus size={14} />}
                    onClick={() => {
                      setMemberGroup(row);
                      setMemberId(undefined);
                    }}
                  >
                    查看成员
                  </Button>
                  {canAdministerGroups && (
                    <>
                      <Button
                        size="small"
                        icon={<Edit3 size={14} />}
                        onClick={() => {
                          setEditingGroup(row);
                          setFormOpen(true);
                        }}
                      >
                        编辑
                      </Button>
                      <Button
                        size="small"
                        danger
                        icon={<Trash2 size={14} />}
                        disabled={row.member_count > 0}
                        title={row.member_count > 0 ? "请先移除全部成员" : "删除群组"}
                        onClick={() => setDeleteTarget(row)}
                      >
                        删除
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
        open={formOpen}
        title={editingGroup ? "编辑群组" : "新建群组"}
        footer={null}
        onCancel={() => {
          setFormOpen(false);
          setEditingGroup(null);
        }}
      >
        <Form<GroupFormValues>
          layout="vertical"
          initialValues={
            editingGroup
              ? {
                  name: editingGroup.name,
                  description: editingGroup.description || undefined,
                  manager_id: editingGroup.manager_id || undefined,
                }
              : undefined
          }
          onFinish={(values) => save.mutate(values)}
        >
          <Form.Item name="name" label="群组名称" rules={[{ required: true }]}>
            <Input placeholder="例如：OLA 组、外包 A 组" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="manager_id" label="外包负责人">
            <Select
              allowClear
              placeholder="可选，指定负责该群组的外包负责人"
              options={users
                .filter((candidate) => candidate.role === "outsourcing_manager")
                .map((candidate) => ({
                  value: candidate.id,
                  label: `${candidate.display_name}（${candidate.username}）`,
                }))}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            保存
          </Button>
        </Form>
      </Modal>
      <Modal
        open={!!memberGroup}
        title={memberGroup ? `管理成员 · ${memberGroup.name}` : "管理成员"}
        footer={null}
        onCancel={() => setMemberGroup(null)}
      >
        {canAdministerGroups && (
          <Space.Compact block>
            <Select
              value={memberId}
              placeholder="选择要加入的账号"
              style={{ flex: 1 }}
              options={users
                .filter(
                  (candidate: User) =>
                    candidate.is_active &&
                    !memberGroup?.members.some((member) => member.id === candidate.id),
                )
                .map((candidate: User) => ({
                  value: candidate.id,
                  label: `${candidate.display_name} · ${roleLabels[candidate.role]}`,
                }))}
              onChange={setMemberId}
            />
            <Button
              type="primary"
              icon={<UserPlus size={15} />}
              disabled={!memberId}
              loading={addMember.isPending}
              onClick={() => addMember.mutate()}
            >
              加入
            </Button>
          </Space.Compact>
        )}
        <Table<UserGroup["members"][number]>
          rowKey="id"
          size="small"
          pagination={false}
          style={{ marginTop: 16 }}
          dataSource={memberGroup?.members || []}
          columns={[
            {
              title: "成员",
              render: (_, member) => `${member.display_name} · ${member.username}`,
            },
            { title: "角色", dataIndex: "role", render: (value: Role) => roleLabels[value] },
            {
              title: "操作",
              width: 90,
              render: (_, member) =>
                canAdministerGroups ? (
                  <Button
                    size="small"
                    danger
                    icon={<UserRoundMinus size={14} />}
                    loading={removeMember.isPending}
                    onClick={() =>
                      removeMember.mutate({
                        groupId: memberGroup?.id as string,
                        userId: member.id,
                      })
                    }
                  >
                    移除
                  </Button>
                ) : (
                  "-"
                ),
            },
          ]}
        />
      </Modal>
      <Modal
        open={!!deleteTarget}
        title={deleteTarget ? `删除群组 ${deleteTarget.name}？` : "删除群组"}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        confirmLoading={removeGroup.isPending}
        onCancel={() => setDeleteTarget(null)}
        onOk={() => {
          if (deleteTarget) removeGroup.mutate(deleteTarget.id);
        }}
      >
        <p>删除后只会移除群组关系，不会删除账号及历史记录。</p>
      </Modal>
    </>
  );
}
