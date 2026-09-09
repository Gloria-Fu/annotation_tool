import { createContext, useContext, useEffect, useRef, useState, type Key, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Button, Form, Input, InputNumber, Layout, Menu, Modal, Progress, Select, Space, Table, Tag, Typography, message,
} from "antd";
import {
  BarChart3, Boxes, CheckCircle2, ClipboardCheck, Database, Download, FileJson, FolderKanban,
  Eraser, LogOut, PackageCheck, Play, Plus, Redo2, RefreshCw, RotateCcw, Scissors, ShieldCheck, Undo2, UserCog, Users, ZoomIn, ZoomOut,
} from "lucide-react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { API_BASE, ApiError, Dataset, Project, Role, TaskItem, TaskPackage, User, api, roleLabels, statusLabels } from "./api";

const { Header, Content, Sider } = Layout;

function useCurrentUser() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<User>("/auth/me"), retry: false });
}

function LoginPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const login = useMutation({
    mutationFn: (values: { username: string; password: string }) => api<User>("/auth/login", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: (user) => queryClient.setQueryData(["me"], user),
    onError: (err: ApiError) => setError(err.message),
  });
  return <div className="login-shell"><div className="login-panel">
    <h1>标注管理平台</h1><p>数据任务、标注审核与质量管理</p>
    {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 18 }} />}
    <Form layout="vertical" onFinish={(v) => login.mutate(v)}>
      <Form.Item label="用户名" name="username" rules={[{ required: true }]}><Input autoFocus /></Form.Item>
      <Form.Item label="密码" name="password" rules={[{ required: true }]}><Input.Password /></Form.Item>
      <Button type="primary" htmlType="submit" block loading={login.isPending}>登录</Button>
    </Form>
  </div></div>;
}

function PasswordGate({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: (v: { current_password: string; new_password: string }) => api<User>("/auth/change-password", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: async () => { queryClient.setQueryData(["me"], undefined); await queryClient.invalidateQueries({ queryKey: ["me"] }); },
    onError: (err: ApiError) => setError(err.message),
  });
  if (!user.must_change_password) return null;
  return <Modal open title="首次登录，请修改密码" footer={null} closable={false}>
    {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 14 }} />}
    <Form layout="vertical" onFinish={(v) => mutation.mutate(v)}>
      <Form.Item label="当前密码" name="current_password" rules={[{ required: true }]}><Input.Password /></Form.Item>
      <Form.Item label="新密码" name="new_password" rules={[{ required: true, min: 10 }]}><Input.Password /></Form.Item>
      <Button type="primary" htmlType="submit" loading={mutation.isPending}>更新密码</Button>
    </Form>
  </Modal>;
}

type ShellContext = { user: User; projects: Project[]; projectId?: string; setProjectId: (id: string) => void };
const shellDefaults: ShellContext = { user: {} as User, projects: [], setProjectId: () => undefined };
const ShellContext = createContext(shellDefaults);
const useShell = () => useContext(ShellContext);

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

function AppShell({ user }: { user: User }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/projects") });
  const [projectId, setProjectId] = useState<string | undefined>(() => localStorage.getItem("projectId") || undefined);
  useEffect(() => {
    if (projects.length && !projects.some((p) => p.id === projectId)) setProjectId(projects[0].id);
  }, [projects, projectId]);
  useEffect(() => { if (projectId) localStorage.setItem("projectId", projectId); }, [projectId]);
  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      // A full reload clears the mounted user observer as well as cached project data.
      queryClient.clear();
      window.location.replace("/");
    }
  };
  const selected = `/${location.pathname.split("/")[1]}`;
  return <ShellContext.Provider value={{ user, projects, projectId, setProjectId }}>
    <PasswordGate user={user} />
    <Layout className="app-shell">
      <Sider width={224} breakpoint="lg" collapsedWidth="0">
        <div className="app-logo"><span className="app-logo-mark"><CheckCircle2 /></span><span>标注管理平台</span></div>
        <Menu theme="dark" mode="inline" selectedKeys={[selected]} items={menuByRole[user.role]} onClick={({ key }) => navigate(key)} />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="header-left">
            <Select value={projectId} placeholder="选择项目" style={{ width: 220 }} options={projects.map((p) => ({ value: p.id, label: p.name }))} onChange={setProjectId} />
          </div>
          <div className="header-user"><div><strong>{user.display_name}</strong> <Typography.Text type="secondary">{roleLabels[user.role]}</Typography.Text></div><Button type="text" icon={<LogOut size={17} />} onClick={logout} title="退出" /></div>
        </Header>
        <Content className="content"><RoutesView /></Content>
      </Layout>
    </Layout>
  </ShellContext.Provider>;
}

function PageHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

function DashboardPage() {
  const { projectId } = useShell();
  const { data, isLoading } = useQuery({ queryKey: ["stats", projectId], queryFn: () => api<any>(`/stats?project_id=${projectId}`), enabled: !!projectId });
  if (!projectId) return <Alert type="info" message="请先创建或选择项目" />;
  const completed = data?.by_status?.completed || 0;
  const pending = (data?.by_status?.available || 0) + (data?.by_status?.annotation_assigned || 0);
  const reviewing = (data?.by_status?.review_pending || 0) + (data?.by_status?.review_assigned || 0) + (data?.by_status?.reviewing || 0);
  return <><PageHeading title="进度看板" subtitle="项目任务状态与人员完成情况" action={<Button icon={<Download size={16} />} href={`${API_BASE}/reports/tasks.csv?project_id=${projectId}`}>导出报表</Button>} />
    <div className="metric-grid">
      <div className="metric"><div className="metric-label">任务总数</div><div className="metric-value">{isLoading ? "-" : data?.total || 0}</div></div>
      <div className="metric"><div className="metric-label">待标注</div><div className="metric-value">{pending}</div></div>
      <div className="metric"><div className="metric-label">审核队列</div><div className="metric-value">{reviewing}</div></div>
      <div className="metric"><div className="metric-label">完成率</div><div className="metric-value">{Math.round((data?.completion_rate || 0) * 100)}%</div></div>
    </div>
    <div className="table-panel"><Table rowKey="user_id" pagination={false} dataSource={data?.by_person || []} columns={[{ title: "人员", dataIndex: "display_name" }, { title: "完成条目", dataIndex: "completed" }]} /></div>
  </>;
}

function ProjectsPage() {
  const qc = useQueryClient(); const [open, setOpen] = useState(false); const [form] = Form.useForm();
  const { data = [] } = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/projects") });
  const create = useMutation({ mutationFn: (v: any) => api("/projects", { method: "POST", body: JSON.stringify(v) }), onSuccess: () => { message.success("项目已创建"); setOpen(false); form.resetFields(); qc.invalidateQueries({ queryKey: ["projects"] }); }, onError: (e: ApiError) => message.error(e.message) });
  return <><PageHeading title="项目管理" action={<Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>新建项目</Button>} />
    <div className="table-panel"><Table rowKey="id" dataSource={data} columns={[{ title: "项目名称", dataIndex: "name" }, { title: "说明", dataIndex: "description", render: (v) => v || "-" }, { title: "状态", render: () => <Tag color="green">启用</Tag> }]} /></div>
    <Modal open={open} title="新建项目" footer={null} onCancel={() => setOpen(false)}><Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}><Form.Item name="name" label="项目名称" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="description" label="说明"><Input.TextArea /></Form.Item><Button type="primary" htmlType="submit" loading={create.isPending}>创建</Button></Form></Modal>
  </>;
}

function UsersPage() {
  const { user, projects, projectId } = useShell(); const qc = useQueryClient(); const [open, setOpen] = useState(false); const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const { data = [] } = useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/users") });
  const create = useMutation({ mutationFn: (v: any) => api("/users", { method: "POST", body: JSON.stringify({ ...v, project_ids: v.project_ids || (projectId ? [projectId] : []) }) }), onSuccess: () => { message.success("账号已创建"); setOpen(false); qc.invalidateQueries({ queryKey: ["users"] }); }, onError: (e: ApiError) => message.error(e.message) });
  const toggle = useMutation({ mutationFn: ({ id, active }: any) => api(`/users/${id}`, { method: "PATCH", body: JSON.stringify({ is_active: active }) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }) });
  const remove = useMutation({ mutationFn: (id: string) => api(`/users/${id}`, { method: "DELETE" }), onSuccess: () => { message.success("账号已删除"); qc.invalidateQueries({ queryKey: ["users"] }); }, onError: (e: ApiError) => message.error(e.message) });
  const roles = user.role === "developer_admin" ? Object.entries(roleLabels) : [["annotator", roleLabels.annotator], ["reviewer", roleLabels.reviewer]];
  return <><PageHeading title="账号与人员" action={<Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>创建账号</Button>} />
    <div className="table-panel"><Table rowKey="id" dataSource={data} columns={[{ title: "用户名", dataIndex: "username" }, { title: "姓名", dataIndex: "display_name" }, { title: "角色", dataIndex: "role", render: (v) => roleLabels[v as Role] }, { title: "状态", dataIndex: "is_active", render: (v) => <Tag color={v ? "green" : "default"}>{v ? "启用" : "停用"}</Tag> }, { title: "操作", render: (_, r) => <Space><Button size="small" disabled={r.id === user.id} onClick={() => toggle.mutate({ id: r.id, active: !r.is_active })}>{r.is_active ? "停用" : "启用"}</Button><Button size="small" danger title={r.id === user.id ? "不能删除当前登录账号" : "删除账号"} onClick={() => { if (r.id === user.id) { message.warning("不能删除当前登录账号"); return; } setDeleteTarget(r); }}>删除</Button></Space> }]} /></div>
    <Modal open={open} title="创建账号" footer={null} onCancel={() => setOpen(false)}><Form layout="vertical" onFinish={(v) => create.mutate(v)} initialValues={{ role: "annotator", project_ids: projectId ? [projectId] : [] }}><Form.Item name="username" label="用户名" rules={[{ required: true, min: 3 }]}><Input /></Form.Item><Form.Item name="display_name" label="姓名" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="password" label="初始密码" rules={[{ required: true, min: 10 }]}><Input.Password /></Form.Item><Form.Item name="role" label="角色"><Select options={roles.map(([value, label]) => ({ value, label }))} /></Form.Item><Form.Item name="project_ids" label="所属项目"><Select mode="multiple" options={projects.map((p) => ({ value: p.id, label: p.name }))} /></Form.Item><Button type="primary" htmlType="submit">创建</Button></Form></Modal>
    <Modal open={!!deleteTarget} title={deleteTarget ? `删除账号 ${deleteTarget.username}？` : "删除账号"} okText="确认删除" cancelText="取消" okButtonProps={{ danger: true }} confirmLoading={remove.isPending} onCancel={() => setDeleteTarget(null)} onOk={async () => { if (!deleteTarget) return; await remove.mutateAsync(deleteTarget.id); setDeleteTarget(null); }}><p>账号会立即停用并从管理列表隐藏，历史任务和审计记录会保留。</p></Modal>
  </>;
}

function DatasetsPage() {
  const { projectId } = useShell(); const qc = useQueryClient(); const [open, setOpen] = useState(false);
  const { data = [], refetch } = useQuery({ queryKey: ["datasets", projectId], queryFn: () => api<Dataset[]>(`/datasets?project_id=${projectId}`), enabled: !!projectId, refetchInterval: 5000 });
  const create = useMutation({ mutationFn: (v: any) => api("/datasets", { method: "POST", body: JSON.stringify({ ...v, project_id: projectId }) }), onSuccess: () => { message.success("导入任务已创建"); setOpen(false); qc.invalidateQueries({ queryKey: ["datasets"] }); }, onError: (e: ApiError) => message.error(e.message) });
  return <><PageHeading title="数据导入" subtitle="登记挂载的 LeRobot v2.1 目录（原始文件不修改）" action={<Space><Button icon={<RefreshCw size={16} />} onClick={() => refetch()} title="刷新" /><Button type="primary" icon={<Plus size={16} />} disabled={!projectId} onClick={() => setOpen(true)}>登记数据集</Button></Space>} />
    <div className="table-panel"><Table rowKey="id" dataSource={data} columns={[{ title: "名称", dataIndex: "name" }, { title: "目录", dataIndex: "root_path", ellipsis: true }, { title: "状态", dataIndex: "status", render: (v) => <Tag color={v === "ready" ? "green" : v === "failed" ? "red" : "blue"}>{statusLabels[v] || v}</Tag> }, { title: "Episodes", dataIndex: "episode_count" }, { title: "警告", dataIndex: "warning_count" }, { title: "错误", dataIndex: "error_message", ellipsis: true }]} /></div>
    <Modal open={open} title="登记 LeRobot 数据集" footer={null} onCancel={() => setOpen(false)}><Form layout="vertical" onFinish={(v) => create.mutate(v)}><Form.Item name="name" label="数据集名称" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="root_path" label="容器内目录" rules={[{ required: true }]}><Input placeholder="/datasets/agibot-episode0-v21_old" /></Form.Item><Button type="primary" htmlType="submit" loading={create.isPending}>开始导入</Button></Form></Modal>
  </>;
}

function PackagesPage() {
  const { user, projectId } = useShell(); const navigate = useNavigate(); const qc = useQueryClient(); const [open, setOpen] = useState(false);
  const { data: packages = [] } = useQuery({ queryKey: ["packages", projectId], queryFn: () => api<TaskPackage[]>(`/task-packages?project_id=${projectId}`), enabled: !!projectId });
  const { data: datasets = [] } = useQuery({ queryKey: ["datasets", projectId], queryFn: () => api<Dataset[]>(`/datasets?project_id=${projectId}`), enabled: !!projectId && ["developer_admin", "annotation_manager"].includes(user.role) });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/users"), enabled: isManagerRole(user.role) });
  const create = useMutation({ mutationFn: (v: any) => api("/task-packages", { method: "POST", body: JSON.stringify({ ...v, project_id: projectId }) }), onSuccess: () => { message.success("任务包已创建"); setOpen(false); qc.invalidateQueries({ queryKey: ["packages"] }); }, onError: (e: ApiError) => message.error(e.message) });
  const publish = useMutation({ mutationFn: (id: string) => api(`/task-packages/${id}/publish`, { method: "POST" }), onSuccess: () => { message.success("已发布"); qc.invalidateQueries({ queryKey: ["packages"] }); }, onError: (e: ApiError) => message.error(e.message) });
  const claim = useMutation({ mutationFn: ({ id, review }: any) => api<TaskItem>(`/${review ? "review-tasks" : "annotation-tasks"}/claim?package_id=${id}`, { method: "POST" }), onSuccess: (item) => navigate(`/work/${item.id}`), onError: (e: ApiError) => message.error(e.message) });
  const isManager = ["developer_admin", "annotation_manager"].includes(user.role);
  const isReview = user.role === "reviewer";
  return <><PageHeading title="任务包" subtitle="每个任务条目对应一个 LeRobot episode" action={isManager ? <Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>创建任务包</Button> : undefined} />
    <div className="table-panel"><Table rowKey="id" dataSource={packages} columns={[{ title: "标题", dataIndex: "title" }, { title: "状态", dataIndex: "status", render: (v) => <Tag color={v === "published" ? "green" : "default"}>{statusLabels[v] || v}</Tag> }, { title: "发放", dataIndex: "claim_policy", render: (v) => v === "random" ? "随机" : "顺序" }, { title: "操作", render: (_, r) => <Space>{isManager && r.status === "draft" && <Button size="small" onClick={() => publish.mutate(r.id)}>发布</Button>}{r.status === "published" && user.role !== "developer_admin" && <Button type="primary" size="small" icon={<Play size={14} />} onClick={() => claim.mutate({ id: r.id, review: isReview })}>领取{isReview ? "审核" : "标注"}</Button>}{isManager && <Button size="small" onClick={() => navigate(`/packages/${r.id}`)}>管理条目</Button>}</Space> }]} /></div>
    <Modal open={open} title="创建任务包" footer={null} onCancel={() => setOpen(false)}><Form layout="vertical" initialValues={{ claim_policy: "sequential" }} onFinish={(v) => create.mutate(v)}><Form.Item name="title" label="标题" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="dataset_id" label="数据集" rules={[{ required: true }]}><Select options={datasets.filter((d) => d.status === "ready").map((d) => ({ value: d.id, label: `${d.name} (${d.episode_count})` }))} /></Form.Item><Form.Item name="claim_policy" label="领取顺序"><Select options={[{ value: "sequential", label: "按 episode 顺序" }, { value: "random", label: "固定随机顺序" }]} /></Form.Item><Form.Item name="member_ids" label="成员范围"><Select mode="multiple" placeholder="留空表示项目内所有成员" options={users.filter((u) => ["annotator", "reviewer"].includes(u.role)).map((u) => ({ value: u.id, label: `${u.display_name} · ${roleLabels[u.role]}` }))} /></Form.Item><Space><Form.Item name="episode_start" label="起始 episode"><InputNumber min={0} /></Form.Item><Form.Item name="episode_end" label="结束 episode"><InputNumber min={0} /></Form.Item></Space><Button type="primary" htmlType="submit">创建草稿</Button></Form></Modal>
  </>;
}

function isManagerRole(role: Role) { return role === "developer_admin" || role === "annotation_manager"; }

function MyTasksPage({ review = false }: { review?: boolean }) {
  const navigate = useNavigate();
  const { data = [] } = useQuery({ queryKey: ["my-tasks", review], queryFn: () => api<TaskItem[]>(`/my-tasks?stage=${review ? "review" : "annotation"}`) });
  return <><PageHeading title={review ? "我的审核" : "我的标注"} /><div className="table-panel"><Table rowKey="id" dataSource={data} columns={[{ title: "任务编号", dataIndex: "id", render: (v) => v.slice(0, 8) }, { title: "状态", dataIndex: "status", render: (v) => <Tag>{statusLabels[v] || v}</Tag> }, { title: "操作", render: (_, r) => <Button type="primary" size="small" onClick={() => navigate(`/work/${r.id}`)}>打开工作台</Button> }]} /></div></>;
}

function PackageItemsPage() {
  const { packageId } = useParams(); const qc = useQueryClient(); const [selected, setSelected] = useState<Key[]>([]); const [stage, setStage] = useState("annotation"); const [assignee, setAssignee] = useState<string>();
  const { data = [] } = useQuery({ queryKey: ["items", packageId], queryFn: () => api<TaskItem[]>(`/task-packages/${packageId}/items`) });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/users") });
  const assignableUsers = users.filter((u) => stage === "annotation" ? ["annotator", "annotation_manager"].includes(u.role) : ["reviewer", "annotation_manager"].includes(u.role));
  const assign = useMutation({ mutationFn: () => api(`/task-packages/${packageId}/assign`, { method: "POST", body: JSON.stringify({ item_ids: selected, assignee_id: assignee, stage }) }), onSuccess: () => { message.success("指派完成"); setSelected([]); qc.invalidateQueries({ queryKey: ["items", packageId] }); }, onError: (e: ApiError) => message.error(e.message) });
  const reclaim = useMutation({ mutationFn: (id: string) => api(`/task-items/${id}/reclaim`, { method: "POST", body: JSON.stringify({ reason: "管理员手动回收" }) }), onSuccess: () => { message.success("任务已回收"); qc.invalidateQueries({ queryKey: ["items", packageId] }); }, onError: (e: ApiError) => message.error(e.message) });
  const reclaimable = ["annotation_assigned", "annotating", "changes_requested", "review_assigned", "reviewing"];
  return <><PageHeading title="任务条目" subtitle="选择待处理条目后可批量指派，已领取条目可手动回收" />
    <div className="toolbar"><Select value={stage} onChange={(v) => { setStage(v); setAssignee(undefined); }} style={{ width: 130 }} options={[{ value: "annotation", label: "标注阶段" }, { value: "review", label: "审核阶段" }]} /><Select value={assignee} onChange={setAssignee} placeholder="选择人员" style={{ width: 220 }} options={assignableUsers.map((u) => ({ value: u.id, label: u.display_name }))} /><Button type="primary" disabled={!selected.length || !assignee} loading={assign.isPending} onClick={() => assign.mutate()}>批量指派 ({selected.length})</Button></div>
    <div className="table-panel"><Table rowKey="id" rowSelection={{ selectedRowKeys: selected, onChange: setSelected, getCheckboxProps: (r) => ({ disabled: stage === "annotation" ? r.status !== "available" : r.status !== "review_pending" }) }} dataSource={data} columns={[{ title: "顺序", dataIndex: "claim_order" }, { title: "条目", dataIndex: "id", render: (v) => v.slice(0, 8) }, { title: "状态", dataIndex: "status", render: (v) => <Tag>{statusLabels[v] || v}</Tag> }, { title: "标注员", dataIndex: "annotator_id", render: (v) => v?.slice(0, 8) || "-" }, { title: "审核员", dataIndex: "reviewer_id", render: (v) => v?.slice(0, 8) || "-" }, { title: "操作", render: (_, r) => reclaimable.includes(r.status) ? <Button size="small" danger onClick={() => reclaim.mutate(r.id)}>回收</Button> : "-" }]} /></div></>;
}

type Segment = { id: string; start_frame: number; end_frame: number; text: string; source?: string; skill?: string | null };

function WorkbenchPage() {
  const { itemId } = useParams();
  const { user } = useShell();
  const queryClient = useQueryClient();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [saveState, setSaveState] = useState("未修改");
  const [history, setHistory] = useState<Segment[][]>([]);
  const [future, setFuture] = useState<Segment[][]>([]);
  const initialized = useRef(false);
  const revisionId = useRef<string | undefined>(undefined);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; index: number; origin: Segment[] } | null>(null);
  const seekRef = useRef(false);
  const syncFrameRef = useRef<(frame: number) => void>(() => undefined);
  const splitRef = useRef<(() => void) | null>(null);
  const { data } = useQuery({ queryKey: ["context", itemId], queryFn: () => api<any>(`/work-items/${itemId}/context`), enabled: !!itemId });

  useEffect(() => {
    if (!data || initialized.current) return;
    const payload = data.latest_revision?.payload || { segments: [] };
    const initial = Array.isArray(payload.segments) ? payload.segments : [];
    setSegments(initial);
    setSelectedId(initial[0]?.id);
    revisionId.current = data.latest_revision?.id || undefined;
    initialized.current = true;
  }, [data]);
  useEffect(() => {
    if (data?.latest_revision?.id) revisionId.current = data.latest_revision.id;
  }, [data?.latest_revision?.id]);

  const saveDraft = useMutation({
    mutationFn: (snapshot: Segment[]) => api(`/work-items/${itemId}/draft`, { method: "PUT", body: JSON.stringify({ schema_version: "segments.v1", payload: { schema_version: "segments.v1", segments: snapshot }, base_revision_id: revisionId.current }) }),
    onMutate: () => setSaveState("保存中"),
    onSuccess: () => { revisionId.current = undefined; setDirty(false); setSaveState("已保存"); queryClient.invalidateQueries({ queryKey: ["context", itemId] }); },
    onError: (e: ApiError) => { setSaveState("保存失败"); message.error(e.message); },
  });
  const clearServer = useMutation({
    mutationFn: () => api(`/work-items/${itemId}/clear`, { method: "POST" }),
    onMutate: () => setSaveState("清空中"),
    onSuccess: () => { setDirty(false); setClearOpen(false); setSaveState("已保存"); queryClient.invalidateQueries({ queryKey: ["context", itemId] }); message.success("已清空当前任务标注"); },
    onError: (e: ApiError) => { setSaveState("清空失败"); message.error(e.message); },
  });
  const submit = useMutation({
    mutationFn: () => api(`/work-items/${itemId}/submit`, { method: "POST", body: JSON.stringify({ schema_version: "segments.v1", payload: { schema_version: "segments.v1", segments }, base_revision_id: revisionId.current }) }),
    onSuccess: () => { message.success("已提交审核"); queryClient.invalidateQueries({ queryKey: ["my-tasks"] }); window.history.back(); },
    onError: (e: ApiError) => message.error(e.message),
  });
  const review = useMutation({
    mutationFn: (decision: "approve" | "request_changes") => api(`/work-items/${itemId}/review`, { method: "POST", body: JSON.stringify({ decision, comment: decision === "approve" ? undefined : "请修改标注", payload: { schema_version: "segments.v1", segments } }) }),
    onSuccess: () => { message.success("审核操作成功"); window.history.back(); },
    onError: (e: ApiError) => message.error(e.message),
  });

  useEffect(() => {
    if (!dirty || !segments || data?.item?.reviewer_id === user.id) return;
    const timer = window.setTimeout(() => saveDraft.mutate(segments), 2000);
    return () => window.clearTimeout(timer);
  }, [segments, dirty, data?.item?.reviewer_id, user.id]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.code !== "Space" || target?.matches("input, textarea, [contenteditable='true']")) return;
      event.preventDefault();
      splitRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      const track = timelineRef.current;
      if (!track || !data) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const frame = Math.round(ratio * data.length);
      if (seekRef.current) {
        syncFrameRef.current?.(frame);
        return;
      }
      if (!drag) return;
      const index = segments.findIndex((segment) => segment.id === drag.id);
      if (index < 0) return;
      const next = segments.map((segment) => ({ ...segment }));
      const boundaryIndex = drag.index;
      const minFrame = boundaryIndex > 1 ? next[boundaryIndex - 2].end_frame + 1 : 1;
      const maxFrame = boundaryIndex < next.length - 1 ? next[boundaryIndex + 1].start_frame - 1 : data.length - 1;
      const boundary = Math.max(minFrame, Math.min(frame, maxFrame));
      next[boundaryIndex - 1].end_frame = boundary;
      next[boundaryIndex].start_frame = boundary;
      setSegments(next); setDirty(true);
    };
    const up = () => {
      const drag = dragRef.current;
      if (drag && JSON.stringify(drag.origin) !== JSON.stringify(segments)) {
        setHistory((items) => [...items, drag.origin]); setFuture([]);
      }
      dragRef.current = null;
      seekRef.current = false;
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [segments, data]);

  if (!data) return null;
  const fps = Number(data.fps || 30);
  const headKey = Object.keys(data.video_urls).find((key) => key.includes("head")) || Object.keys(data.video_urls)[0];
  const reviewing = data.item.reviewer_id === user.id;
  const selected = segments.find((segment) => segment.id === selectedId) || segments[0];
  const commit = (next: Segment[]) => { setHistory((items) => [...items, segments]); setFuture([]); setSegments(next); setDirty(true); };
  const syncFrame = (frame: number) => {
    const bounded = Math.max(0, Math.min(data.length, frame));
    setCurrentFrame(bounded);
    Object.values(videoRefs.current).forEach((video) => { if (video && Math.abs(video.currentTime - bounded / fps) > 0.08) video.currentTime = bounded / fps; });
  };
  syncFrameRef.current = syncFrame;
  const playAll = () => { Object.values(videoRefs.current).forEach((video) => video?.play().catch(() => undefined)); setPlaying(true); };
  const pauseAll = () => { Object.values(videoRefs.current).forEach((video) => video?.pause()); setPlaying(false); };
  const updateSelectedText = (text: string) => { if (!selected) return; commit(segments.map((segment) => segment.id === selected.id ? { ...segment, text } : segment)); };
  const split = () => {
    if (!selected || currentFrame <= selected.start_frame || currentFrame >= selected.end_frame) { message.info("请将播放头放在当前片段内部"); return; }
    const first = { ...selected, end_frame: currentFrame };
    const second = { ...selected, id: `${selected.id}-split-${Date.now()}`, start_frame: currentFrame, text: "", source: "user" };
    commit(segments.flatMap((segment) => segment.id === selected.id ? [first, second] : [segment]));
    setSelectedId(second.id);
  };
  splitRef.current = split;
  const clear = () => setClearOpen(true);
  const confirmClear = async () => {
    setHistory((items) => [...items, segments]);
    setFuture([]);
    setSegments([]);
    setDirty(false);
    setSelectedId(undefined);
    await clearServer.mutateAsync();
  };
  const undo = () => { const previous = history[history.length - 1]; if (!previous) return; setFuture((items) => [...items, segments]); setHistory((items) => items.slice(0, -1)); setSegments(previous); setDirty(true); };
  const redo = () => { const next = future[future.length - 1]; if (!next) return; setHistory((items) => [...items, segments]); setFuture((items) => items.slice(0, -1)); setSegments(next); setDirty(true); };
  const formatTime = (frame: number) => `${(frame / fps).toFixed(2)}s`;
  const orderedKeys = [headKey, ...Object.keys(data.video_urls).filter((key: string) => key !== headKey)];
  return <>
    <PageHeading title={`Episode ${data.episode_index}`} subtitle={`${data.length} 帧 · ${(data.length / fps).toFixed(2)} 秒 · ${data.tasks.join(" / ")}`} action={<Typography.Text type={saveState === "保存失败" ? "danger" : "secondary"}>{saveState}</Typography.Text>} />
    <div className="annotation-workbench">
      <section className="workbench-main">
        <div className="video-grid">
          {orderedKeys.map((key, index) => <div key={key} className={index === 0 ? "video-card video-head" : "video-card video-side"}>
            <div className="video-label">{key.includes("head") ? "HEAD 主视角" : key.includes("left") ? "LEFT 左视角" : "RIGHT 右视角"}</div>
            <video ref={(element) => { videoRefs.current[key] = element; if (element) { element.playbackRate = rate; element.currentTime = currentFrame / fps; } }} src={data.video_urls[key]} preload="metadata" muted={index > 0} onPlay={index === 0 ? playAll : undefined} onPause={index === 0 ? pauseAll : undefined} onRateChange={(event) => { if (index === 0) setRate(event.currentTarget.playbackRate); }} onTimeUpdate={index === 0 ? (event) => syncFrame(Math.round(event.currentTarget.currentTime * fps)) : undefined} controls={index === 0} />
          </div>)}
        </div>
        <div className="annotation-toolbar">
          <Button icon={<Scissors size={15} />} onClick={split}>分段</Button>
          <Button icon={<Eraser size={15} />} onClick={clear} title="一键清空当前任务的全部标注">清空全部标注</Button>
          <Button icon={<ZoomOut size={15} />} onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} title="缩小时间轴" />
          <Button icon={<ZoomIn size={15} />} onClick={() => setZoom((value) => Math.min(3, value + 0.25))} title="放大时间轴" />
          <Button icon={<RotateCcw size={15} />} onClick={() => setZoom(1)} title="重置时间轴缩放" />
          <Select value={rate} onChange={(value) => { setRate(value); Object.values(videoRefs.current).forEach((video) => { if (video) video.playbackRate = value; }); }} options={[0.5, 1, 1.5, 2, 3].map((value) => ({ value, label: `${value}x` }))} style={{ width: 88 }} />
          <Button icon={<Undo2 size={15} />} disabled={!history.length} onClick={undo} title="撤销" />
          <Button icon={<Redo2 size={15} />} disabled={!future.length} onClick={redo} title="重做" />
          <Typography.Text type="secondary">{formatTime(currentFrame)} / {formatTime(data.length)}</Typography.Text>
        </div>
        <div className="timeline-scroll"><div className="timeline-track" ref={timelineRef} style={{ width: `${zoom * 100}%` }} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); syncFrame(Math.round(((event.clientX - rect.left) / rect.width) * data.length)); }}>
          <div className="timeline-playhead" style={{ left: `${(currentFrame / data.length) * 100}%` }} />
          {segments.map((segment, index) => <div key={segment.id} className={`timeline-segment ${segment.id === selected?.id ? "active" : ""}`} style={{ left: `${(segment.start_frame / data.length) * 100}%`, width: `${((segment.end_frame - segment.start_frame) / data.length) * 100}%` }} onClick={(event) => { event.stopPropagation(); setSelectedId(segment.id); syncFrame(segment.start_frame); }}>
            <span>{index + 1}. {segment.text || "未填写"}</span>
            {index > 0 && <i className="timeline-divider" aria-label="拖动调整片段分界" onPointerDown={(event) => { event.stopPropagation(); dragRef.current = { id: segment.id, index, origin: segments.map((item) => ({ ...item })) }; }} />}
          </div>)}
          <div className="timeline-axis">{[0, 0.25, 0.5, 0.75, 1].map((ratio) => <span key={ratio} style={{ left: `${ratio * 100}%` }}>{formatTime(Math.round(data.length * ratio))}</span>)}</div>
          <div className="timeline-handle" title="拖动定位播放位置" style={{ left: `${(currentFrame / data.length) * 100}%` }} onPointerDown={(event) => { event.stopPropagation(); seekRef.current = true; }} />
        </div></div>
      </section>
      <aside className="segment-editor">
        <div className="editor-heading"><Typography.Title level={4}>当前标注段</Typography.Title><Tag color={reviewing ? "gold" : "blue"}>{reviewing ? "待审核" : "编辑中"}</Tag></div>
        {selected ? <><div className="segment-meta">{formatTime(selected.start_frame)} - {formatTime(selected.end_frame)} · 时长 {((selected.end_frame - selected.start_frame) / fps).toFixed(2)} 秒</div><Input.TextArea value={selected.text} onChange={(event) => updateSelectedText(event.target.value)} rows={10} placeholder="填写这一段视频的动作描述" maxLength={2000} showCount /><Space wrap style={{ marginTop: 14 }}>{!reviewing && <Button onClick={() => saveDraft.mutate(segments)} loading={saveDraft.isPending}>保存草稿</Button>}{reviewing ? <><Button danger onClick={() => review.mutate("request_changes")}>退回修改</Button><Button type="primary" disabled={!segments.length || segments.some((segment) => !segment.text.trim())} onClick={() => review.mutate("approve")}>审核通过</Button></> : <Button type="primary" disabled={!segments.length || segments.some((segment) => !segment.text.trim())} onClick={() => submit.mutate()} loading={submit.isPending}>提交审核</Button>}</Space></> : <Typography.Text type="secondary">暂无标注片段，请在时间轴中创建或导入片段。</Typography.Text>}
      </aside>
    </div>
    <Modal open={clearOpen} title="清空全部标注？" okText="清空" cancelText="取消" okButtonProps={{ danger: true }} confirmLoading={clearServer.isPending} onCancel={() => { if (!clearServer.isPending) setClearOpen(false); }} onOk={confirmClear}>
      <p>当前任务中的标注会重置为一个覆盖整个 episode 的空白片段，原始数据文件不会改变。</p>
    </Modal>
  </>;
}

function QualityPage() {
  const { projectId } = useShell(); const [packageId, setPackageId] = useState<string>(); const qc = useQueryClient();
  const { data: packages = [] } = useQuery({ queryKey: ["packages", projectId], queryFn: () => api<TaskPackage[]>(`/task-packages?project_id=${projectId}`), enabled: !!projectId });
  const { data: items = [] } = useQuery({ queryKey: ["quality-items", packageId], queryFn: () => api<TaskItem[]>(`/task-packages/${packageId}/items?status=completed`), enabled: !!packageId });
  const check = useMutation({ mutationFn: ({ id, result }: any) => api(`/work-items/${id}/quality-check`, { method: "POST", body: JSON.stringify({ result }) }), onSuccess: () => { message.success("抽检结果已记录"); qc.invalidateQueries({ queryKey: ["quality-items"] }); }, onError: (e: ApiError) => message.error(e.message) });
  return <><PageHeading title="质量抽检" /><div className="toolbar"><Select value={packageId} onChange={setPackageId} placeholder="选择任务包" style={{ width: 280 }} options={packages.map((p) => ({ value: p.id, label: p.title }))} /></div><div className="table-panel"><Table rowKey="id" dataSource={items} columns={[{ title: "条目", dataIndex: "id", render: (v) => v.slice(0, 8) }, { title: "当前抽检", dataIndex: "qa_status" }, { title: "操作", render: (_, r) => <Space><Button size="small" onClick={() => check.mutate({ id: r.id, result: "passed" })}>通过</Button><Button size="small" danger onClick={() => check.mutate({ id: r.id, result: "rejected" })}>退回</Button></Space> }]} /></div></>;
}

function RoutesView() {
  const { user } = useShell();
  const home = user.role === "annotator" ? "/packages" : user.role === "reviewer" ? "/packages" : "/dashboard";
  return <Routes>
    <Route path="/" element={<Navigate to={home} replace />} />
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/projects" element={<ProjectsPage />} />
    <Route path="/users" element={<UsersPage />} />
    <Route path="/datasets" element={<DatasetsPage />} />
    <Route path="/packages" element={<PackagesPage />} />
    <Route path="/packages/:packageId" element={<PackageItemsPage />} />
    <Route path="/my-tasks" element={<MyTasksPage />} />
    <Route path="/reviews" element={<MyTasksPage review />} />
    <Route path="/quality" element={<QualityPage />} />
    <Route path="/work/:itemId" element={<WorkbenchPage />} />
    <Route path="*" element={<Navigate to={home} replace />} />
  </Routes>;
}

function Root() {
  const { data: user, isLoading, error } = useCurrentUser();
  if (isLoading) return <div className="login-shell"><Progress type="circle" percent={75} status="active" /></div>;
  if (!user || (error instanceof ApiError && error.status === 401)) return <LoginPage />;
  return <AppShell user={user} />;
}

export default function App() { return <BrowserRouter><Root /></BrowserRouter>; }
