import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import type { TaskItem, User } from "../../shared/api/types";
import { PackageItemsPage } from "./PackageItemsPage";

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
      user: {
        id: "manager-1",
        username: "manager",
        display_name: "管理员",
        role: "annotation_manager",
        is_active: true,
        must_change_password: false,
      },
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

it("shows assignee name and username instead of a truncated user id", async () => {
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

  expect(await screen.findByText("张三")).toBeVisible();
  expect(screen.getByText("@zhangsan")).toBeVisible();
  expect(screen.queryByText("user-1".slice(0, 8))).not.toBeInTheDocument();
});
