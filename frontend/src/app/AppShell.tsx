import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Layout, Menu, Select, Typography } from "antd";
import {
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileJson,
  FolderKanban,
  LogOut,
  PackageCheck,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { authApi } from "../features/auth/api";
import { PasswordGate } from "../features/auth/components/PasswordGate";
import { projectsApi } from "../features/projects/api";
import { roleLabels } from "../shared/constants/labels";
import { queryKeys } from "../shared/queryKeys";
import { ShellContext } from "./shellContext";
import type { Role, User } from "../shared/api/types";

const { Header, Content, Sider } = Layout;

const menuByRole: Record<Role, { key: string; label: string; icon: ReactNode }[]> = {
  developer_admin: [
    { key: "/dashboard", label: "进度看板", icon: <BarChart3 size={18} /> },
    { key: "/projects", label: "项目管理", icon: <FolderKanban size={18} /> },
    { key: "/users", label: "账号管理", icon: <Users size={18} /> },
    { key: "/datasets", label: "数据导入", icon: <Database size={18} /> },
    { key: "/packages", label: "任务包", icon: <Boxes size={18} /> },
    { key: "/quality", label: "质量抽检", icon: <ShieldCheck size={18} /> },
  ],
  annotation_manager: [
    { key: "/dashboard", label: "项目进度", icon: <BarChart3 size={18} /> },
    { key: "/users", label: "人员管理", icon: <UserCog size={18} /> },
    { key: "/packages", label: "任务包", icon: <Boxes size={18} /> },
    { key: "/my-tasks", label: "我的标注", icon: <FileJson size={18} /> },
    { key: "/reviews", label: "我的审核", icon: <ClipboardCheck size={18} /> },
  ],
  reviewer: [
    { key: "/packages", label: "审核任务包", icon: <PackageCheck size={18} /> },
    { key: "/reviews", label: "我的审核", icon: <ClipboardCheck size={18} /> },
  ],
  annotator: [
    { key: "/packages", label: "标注任务包", icon: <PackageCheck size={18} /> },
    { key: "/my-tasks", label: "我的标注", icon: <FileJson size={18} /> },
  ],
};

export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: projects = [] } = useQuery({
    queryKey: queryKeys.projects,
    queryFn: projectsApi.list,
  });
  const [projectId, setProjectId] = useState<string | undefined>(
    () => localStorage.getItem("projectId") || undefined,
  );

  useEffect(() => {
    if (projectId) localStorage.setItem("projectId", projectId);
  }, [projectId]);
  const activeProjectId = projects.some((project) => project.id === projectId)
    ? projectId
    : projects[0]?.id;

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      queryClient.clear();
      window.location.replace("/");
    }
  };
  const selected = `/${location.pathname.split("/")[1]}`;

  return (
    <ShellContext.Provider value={{ user, projects, projectId: activeProjectId, setProjectId }}>
      <PasswordGate mustChangePassword={user.must_change_password} />
      <Layout className="app-shell">
        <Sider width={224} breakpoint="lg" collapsedWidth="0">
          <div className="app-logo">
            <span className="app-logo-mark">
              <CheckCircle2 />
            </span>
            <span>标注管理平台</span>
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selected]}
            items={menuByRole[user.role]}
            onClick={({ key }) => void navigate(key)}
          />
        </Sider>
        <Layout>
          <Header className="app-header">
            <div className="header-left">
              <Select
                value={activeProjectId}
                placeholder="选择项目"
                style={{ width: 220 }}
                options={projects.map((project) => ({ value: project.id, label: project.name }))}
                onChange={setProjectId}
              />
            </div>
            <div className="header-user">
              <div>
                <strong>{user.display_name}</strong>{" "}
                <Typography.Text type="secondary">{roleLabels[user.role]}</Typography.Text>
              </div>
              <Button
                type="text"
                icon={<LogOut size={17} />}
                onClick={() => void logout()}
                title="退出"
              />
            </div>
          </Header>
          <Content className="content">{children}</Content>
        </Layout>
      </Layout>
    </ShellContext.Provider>
  );
}
