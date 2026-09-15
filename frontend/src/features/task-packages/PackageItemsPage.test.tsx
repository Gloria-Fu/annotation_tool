import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TaskItem, User } from "../../shared/api/types";
import { PackageItemsPage } from "./PackageItemsPage";

const shellUser = vi.hoisted(() => ({
  current: {
    id: "manager-1",
    username: "manager",
    display_name: "管理员",
    role: "annotation_manager",
    is_active: true,
    must_change_password: false,
  },
}));

const users: User[] = [
  {
    id: "user-1",
    username: "zhangsan",
    display_name: "张三",
    role: "annotator",
    is_active: true,
    must_change_password: false,
  },
];

const item: TaskItem = {
  id: "item-1",
  package_id: "package-1",
  episode_id: "episode-1",
  claim_order: 0,
  status: "annotating",
  annotator_id: "user-1",
  reviewer_id: null,
  qa_status: "unchecked",
  updated_at: "2026-01-01T00:00:00Z",
};

vi.mock("../../app/shellContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../app/shellContext")>();
  return {
    ...actual,
    useShell: () => ({
      user: shellUser.current,
      projects: [],
      projectId: "project-1",
      setProjectId: vi.fn(),
    }),
  };
});

vi.mock("./api", () => ({
  taskPackagesApi: {
    items: vi.fn(() => Promise.resolve([item])),
    assign: vi.fn(),
    reclaim: vi.fn(),
    usersForStage: (availableUsers: User[]) => availableUsers,
  },
}));

vi.mock("../users/api", () => ({
  usersApi: {
    list: vi.fn(() => Promise.resolve(users)),
  },
}));

beforeEach(() => {
  shellUser.current = {
    id: "manager-1",
    username: "manager",
    display_name: "管理员",
    role: "annotation_manager",
    is_active: true,
    must_change_password: false,
  };
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/packages/package-1"]}>
        <Routes>
          <Route path="/packages/:packageId" element={<PackageItemsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("shows assignee name and username instead of a truncated user id", async () => {
  renderPage();

  expect(await screen.findByText("张三")).toBeVisible();
  expect(screen.getByText("@zhangsan")).toBeVisible();
  expect(screen.queryByText("user-1".slice(0, 8))).not.toBeInTheDocument();
});

it("lets outsourcing managers reclaim visible group assignees", async () => {
  shellUser.current = {
    id: "outsourcing-manager-1",
    username: "outsourcing-manager",
    display_name: "合作方负责人",
    role: "outsourcing_manager",
    is_active: true,
    must_change_password: false,
  };
  renderPage();

  expect(await screen.findByRole("button", { name: "查看详情" })).toBeVisible();
  expect(screen.getByRole("button", { name: /回\s*收/ })).toBeVisible();
  expect(screen.queryByText("批量指派 (0)")).not.toBeInTheDocument();
});
