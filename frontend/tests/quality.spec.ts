import { expect, test } from "@playwright/test";

test("developer admin can generate and open a quality sampling list", async ({ page }) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "admin",
        username: "admin",
        display_name: "研发管理员",
        role: "developer_admin",
        is_active: true,
        must_change_password: false,
      }),
    }),
  );
  await page.route("**/api/v1/projects", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "project", name: "测试项目", is_active: true }]),
    }),
  );
  await page.route("**/api/v1/users", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "admin",
          username: "admin",
          display_name: "研发管理员",
          role: "developer_admin",
          is_active: true,
          must_change_password: false,
        },
      ]),
    }),
  );
  await page.route("**/api/v1/task-packages**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "package",
          project_id: "project",
          dataset_id: "dataset",
          title: "抽检任务包",
          description: null,
          status: "published",
          claim_policy: "sequential",
          random_seed: null,
          created_at: "2026-09-13T00:00:00Z",
          total_items: 4,
          claimed_items: 4,
          annotated_items: 4,
          reviewed_items: 4,
        },
      ]),
    }),
  );
  const sample = {
    id: "sample",
    batch_id: "batch",
    task_item_id: "item-1",
    sample_order: 0,
    item: {
      id: "item-1",
      package_id: "package",
      episode_id: "episode-1",
      claim_order: 1,
      status: "completed",
      annotator_id: "annotator",
      reviewer_id: "reviewer",
      qa_status: "unchecked",
      updated_at: "2026-09-13T00:00:00Z",
    },
    latest_check: null,
  };
  const batch = {
    id: "batch",
    project_id: "project",
    package_id: "package",
    created_by_id: "admin",
    mode: "ratio",
    sample_percent: 10,
    sample_count: null,
    seed: "quality",
    only_unchecked: true,
    status: "open",
    created_at: "2026-09-13T00:00:00Z",
    completed_at: null,
    total_samples: 1,
    checked_samples: 0,
    passed_samples: 0,
    rejected_samples: 0,
    samples: [sample],
  };
  await page.route("**/api/v1/quality-batches**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ...batch, samples: [] }),
    });
  });
  await page.route("**/api/v1/quality-batches?project_id=project", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([batch]),
    }),
  );
  await page.route("**/api/v1/quality-batches/batch", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(batch),
    }),
  );
  await page.route("**/api/v1/work-items/*/context", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        item: {
          id: "item-1",
          package_id: "package",
          episode_id: "episode-1",
          claim_order: 1,
          status: "completed",
          annotator_id: "annotator",
          reviewer_id: "reviewer",
          qa_status: "unchecked",
          updated_at: "2026-09-13T00:00:00Z",
        },
        episode_index: 1,
        length: 10,
        fps: 30,
        preview_speed_factor: 1.3,
        tasks: ["pick"],
        data_url: "/api/v1/work-items/item-1/data",
        video_urls: {},
        latest_revision: {
          id: "revision",
          version: 1,
          schema_version: "segments.v1",
          payload: {
            schema_version: "segments.v1",
            segments: [
              {
                id: "segment-1",
                start_frame: 0,
                end_frame: 10,
                text: "pick",
                annotation_status: "confirmed",
              },
            ],
          },
          stage: "review",
          file_path: null,
          file_hash: null,
        },
        review_comment: null,
      }),
    }),
  );

  await page.goto("/quality");
  await page.locator(".toolbar").getByRole("combobox").first().click();
  await page.getByText("抽检任务包").click();
  await page.getByRole("button", { name: "生成抽检清单" }).click();

  await expect(page.getByText("当前批次样本 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "查看", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /通\s*过/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /退\s*回/ })).toBeVisible();

  await page.getByRole("button", { name: "查看", exact: true }).click();
  await expect(page).toHaveURL(/\/work\/item-/);
});

test("failed quality sampling shows the backend reason in a modal", async ({ page }) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "admin",
        username: "admin",
        display_name: "研发管理员",
        role: "developer_admin",
        is_active: true,
        must_change_password: false,
      }),
    }),
  );
  await page.route("**/api/v1/projects", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "project", name: "测试项目", is_active: true }]),
    }),
  );
  await page.route("**/api/v1/users", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "admin",
          username: "admin",
          display_name: "研发管理员",
          role: "developer_admin",
          is_active: true,
          must_change_password: false,
        },
      ]),
    }),
  );
  await page.route("**/api/v1/task-packages**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "package",
          project_id: "project",
          dataset_id: "dataset",
          title: "无可抽检任务包",
          description: null,
          status: "published",
          claim_policy: "sequential",
          random_seed: null,
          created_at: "2026-09-13T00:00:00Z",
          total_items: 4,
          claimed_items: 4,
          annotated_items: 2,
          reviewed_items: 4,
        },
      ]),
    }),
  );
  await page.route("**/api/v1/quality-batches?project_id=project", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    }),
  );
  await page.route("**/api/v1/quality-batches**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ detail: "没有符合条件的已完成任务可供抽检" }),
    });
  });

  await page.goto("/quality");
  await page.locator(".toolbar").getByRole("combobox").first().click();
  await page.getByText("无可抽检任务包").click();
  await page.getByRole("button", { name: "生成抽检清单" }).click();

  await expect(page.getByRole("dialog")).toContainText("生成抽检清单失败");
  await expect(page.getByRole("dialog")).toContainText("没有符合条件的已完成任务可供抽检");
  await expect(page.getByRole("button", { name: "生成抽检清单" })).toBeEnabled();
});

test("quality sampling is disabled when the selected package has no reviewed items", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "admin",
        username: "admin",
        display_name: "研发管理员",
        role: "developer_admin",
        is_active: true,
        must_change_password: false,
      }),
    }),
  );
  await page.route("**/api/v1/projects", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "project", name: "测试项目", is_active: true }]),
    }),
  );
  await page.route("**/api/v1/users", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "admin",
          username: "admin",
          display_name: "研发管理员",
          role: "developer_admin",
          is_active: true,
          must_change_password: false,
        },
      ]),
    }),
  );
  await page.route("**/api/v1/task-packages**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "package",
          project_id: "project",
          dataset_id: "dataset",
          title: "未完成任务包",
          description: null,
          status: "published",
          claim_policy: "sequential",
          random_seed: null,
          created_at: "2026-09-13T00:00:00Z",
          total_items: 4,
          claimed_items: 4,
          annotated_items: 2,
          reviewed_items: 0,
        },
      ]),
    }),
  );
  let postCalls = 0;
  await page.route("**/api/v1/quality-batches**", (route) => {
    if (route.request().method() === "POST") {
      postCalls += 1;
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "不应发起抽检创建请求" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.goto("/quality");
  await page.locator(".toolbar").getByRole("combobox").first().click();
  await page.getByText("未完成任务包").click();

  await expect(page.getByRole("button", { name: "生成抽检清单" })).toBeDisabled();
  await expect(page.getByText("所选任务包暂无已审核完成任务")).toBeVisible();
  expect(postCalls).toBe(0);
});
