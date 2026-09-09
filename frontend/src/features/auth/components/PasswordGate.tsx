import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Form, Input, Modal } from "antd";
import { ApiError } from "../../../shared/api/client";
import { queryKeys } from "../../../shared/queryKeys";
import { authApi, type PasswordChangeInput } from "../api";

export function PasswordGate({ mustChangePassword }: { mustChangePassword: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: (values: PasswordChangeInput) => authApi.changePassword(values),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
    onError: (err: ApiError) => setError(err.message),
  });

  if (!mustChangePassword) return null;
  return (
    <Modal open title="首次登录，请修改密码" footer={null} closable={false}>
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 14 }} />}
      <Form layout="vertical" onFinish={(values: PasswordChangeInput) => mutation.mutate(values)}>
        <Form.Item label="当前密码" name="current_password" rules={[{ required: true }]}>
          <Input.Password />
        </Form.Item>
        <Form.Item label="新密码" name="new_password" rules={[{ required: true, min: 10 }]}>
          <Input.Password />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          更新密码
        </Button>
      </Form>
    </Modal>
  );
}
