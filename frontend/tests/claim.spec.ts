import { expect, test } from "@playwright/test";

test("failed annotation claim opens a reason modal from the package button", async ({ page }) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "annotator",
        username: "annotator",
        display_name: "标注员",
        role: "annotator",
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
  await page.route("**/api/v1/task-packages**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "package",
          project_id: "project",
          dataset_id: "dataset",
          title: "已完成任务包",
          description: null,
          status: "published",
          claim_policy: "sequential",
          random_seed: null,
          created_at: "2026-09-13T00:00:00Z",
          total_items: 1,
          claimed_items: 1,
          annotated_items: 1,
          reviewed_items: 1,
        },
      ]),
    }),
  );
  await page.route("**/api/v1/annotation-tasks/claim**", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "暂无可领取标注任务：任务包中的条目已被领取，或当前没有可领取条目。",
      }),
    }),
  );

  await page.goto("/packages");
  await page.getByRole("button", { name: "领取标注" }).click();
  await expect(page.getByRole("dialog")).toContainText("领取标注失败");
  await expect(page.getByRole("dialog")).toContainText("暂无可领取标注任务");
});

test("reviewer chooses random claim order before taking a review task", async ({ page }) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "reviewer",
        username: "reviewer",
        display_name: "审核员",
        role: "reviewer",
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
  await page.route("**/api/v1/task-packages**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "package",
          project_id: "project",
          dataset_id: "dataset",
          title: "待审核任务包",
          description: null,
          status: "published",
          claim_policy: "sequential",
          random_seed: null,
          created_at: "2026-09-13T00:00:00Z",
          total_items: 2,
          claimed_items: 2,
          annotated_items: 2,
          reviewed_items: 0,
        },
      ]),
    }),
  );
  await page.route("**/api/v1/review-tasks/claim**", async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("claim_policy")).toBe("random");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "item-1",
        package_id: "package",
        episode_id: "episode-1",
        claim_order: 1,
        status: "review_assigned",
        annotator_id: "annotator",
        reviewer_id: "reviewer",
        qa_status: "unchecked",
        updated_at: "2026-09-13T00:00:00Z",
      }),
    });
  });

  await page.goto("/packages");
  await page.getByRole("button", { name: "领取审核" }).click();
  await expect(page.getByRole("dialog")).toContainText("选择审核领取方式");
  await page.getByText("随机抽检", { exact: true }).click();
  await page.getByRole("button", { name: "开始领取" }).click();
  await expect(page).toHaveURL(/\/work\/item-1/);
});
