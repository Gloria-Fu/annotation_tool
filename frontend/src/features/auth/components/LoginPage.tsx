import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Form, Input } from "antd";
import { ApiError } from "../../../shared/api/client";
import type { User } from "../../../shared/api/types";
import { brand } from "../../../shared/brand";
import { queryKeys } from "../../../shared/queryKeys";
import { authApi, type LoginInput } from "../api";

export function LoginPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const login = useMutation({
    mutationFn: (values: LoginInput) => authApi.login(values),
    onSuccess: (user: User) => queryClient.setQueryData(queryKeys.me, user),
    onError: (err: ApiError) => setError(err.message),
  });

  return (
    <div className="login-shell">
      <div className="login-panel">
        <div className="login-brand">
          <div className="login-logo-frame">
            <img src={brand.logoUrl} alt={brand.logoAlt} />
          </div>
          <div>
            <h1>{brand.name}</h1>
            <p>数据任务、标注审核与质量管理</p>
          </div>
        </div>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 18 }} />}
        <Form layout="vertical" onFinish={(values: LoginInput) => login.mutate(values)}>
          <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={login.isPending}>
            登录
          </Button>
        </Form>
      </div>
    </div>
  );
}
