import { Progress } from "antd";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { LoginPage } from "../features/auth/components/LoginPage";
import { useCurrentUser } from "../features/auth/hooks/useCurrentUser";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { DatasetsPage } from "../features/datasets/DatasetsPage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { QualityPage } from "../features/quality/QualityPage";
import { MyTasksPage } from "../features/task-packages/MyTasksPage";
import { PackageItemsPage } from "../features/task-packages/PackageItemsPage";
import { PackagesPage } from "../features/task-packages/PackagesPage";
import { UsersPage } from "../features/users/UsersPage";
import { WorkbenchPage } from "../features/workbench/WorkbenchPage";
import type { User } from "../shared/api/types";

function AuthenticatedRoutes({ user }: { user: User }) {
  const home = user.role === "annotator" || user.role === "reviewer" ? "/packages" : "/dashboard";
  return (
    <AppShell user={user}>
      <Routes>
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
      </Routes>
    </AppShell>
  );
}

export function AppRouter() {
  const { data: user, isLoading, error } = useCurrentUser();
  if (isLoading) {
    return (
      <div className="login-shell">
        <Progress type="circle" percent={75} status="active" />
      </div>
    );
  }
  if (!user || (error instanceof Error && "status" in error && error.status === 401)) {
    return <LoginPage />;
  }
  return <AuthenticatedRoutes user={user} />;
}
