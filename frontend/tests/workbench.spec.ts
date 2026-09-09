import { expect, test, type Page } from "@playwright/test";

const project = { id: "project-1", name: "测试项目", is_active: true };
const annotator = {
  id: "annotator-1",
  username: "annotator",
  display_name: "标注员",
  role: "annotator",
  is_active: true,
  must_change_password: false,
};
const reviewer = {
  id: "reviewer-1",
  username: "reviewer",
  display_name: "审核员",
  role: "reviewer",
  is_active: true,
  must_change_password: false,
};

const annotatorItem = {
  id: "item-1",
  package_id: "package-1",
  episode_id: "episode-1",
  claim_order: 0,
  status: "annotating",
  annotator_id: annotator.id,
  reviewer_id: null,
  qa_status: "unchecked",
  updated_at: "2026-01-01T00:00:00Z",
};

const contextFor = (item: typeof annotatorItem, userId: string) => ({
  item: { ...item, reviewer_id: userId === reviewer.id ? reviewer.id : item.reviewer_id },
  episode_index: 0,
  length: 100,
  fps: 10,
  tasks: ["pick"],
  data_url: "/api/v1/work-items/item-1/data",
  video_urls: {},
  latest_revision: {
    id: "revision-1",
    version: 1,
    schema_version: "segments.v1",
    payload: {
      schema_version: "segments.v1",
      segments: [
        {
          id: "segment-1",
          start_frame: 0,
          end_frame: 100,
          text: "pick the object",
          source: "imported",
        },
      ],
    },
    stage: "draft",
    file_path: "annotations/item-1/v0001.json",
    file_hash: "a".repeat(64),
  },
});

async function mockShell(page: Page, user: typeof annotator | typeof reviewer) {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(user),
    }),
  );
  await page.route("**/api/v1/projects", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([project]),
    }),
  );
  await page.route("**/api/v1/work-items/item-1/context", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(contextFor(annotatorItem, user.id)),
    }),
  );
}

test("annotator can edit, split, undo, redo, autosave, clear, and submit", async ({ page }) => {
  await mockShell(page, annotator);
  let draftCalls = 0;
  let clearCalls = 0;
  let submitCalls = 0;
  const updatedItem = { ...annotatorItem, status: "annotating" };

  await page.route("**/api/v1/work-items/item-1/draft", async (route) => {
    draftCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(updatedItem),
    });
  });
  await page.route("**/api/v1/work-items/item-1/clear", async (route) => {
    clearCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(updatedItem),
    });
  });
  await page.route("**/api/v1/work-items/item-1/submit", async (route) => {
    submitCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...updatedItem, status: "review_pending", reviewer_id: null }),
    });
  });

  await page.goto("/packages");
  await page.goto("/work/item-1");
  await expect(page.getByRole("heading", { name: "Episode 0" })).toBeVisible();
  await expect(page.getByText("pick the object").first()).toBeVisible();

  const track = page.locator(".timeline-track");
  await track.click({ position: { x: 550, y: 95 } });
  await page.getByRole("button", { name: "分段" }).click();
  await expect(page.locator(".timeline-segment")).toHaveCount(2);
  await expect(page.getByText("未填写")).toBeVisible();

  await page.getByTitle("撤销").click();
  await expect(page.locator(".timeline-segment")).toHaveCount(1);
  await page.getByTitle("重做").click();
  await expect(page.locator(".timeline-segment")).toHaveCount(2);

  const divider = page.getByLabel("拖动调整片段分界");
  const dividerBox = await divider.boundingBox();
  expect(dividerBox).not.toBeNull();
  if (dividerBox) {
    await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + 5);
    await page.mouse.down();
    await page.mouse.move(dividerBox.x + 30, dividerBox.y + 5);
    await page.mouse.up();
  }

  const editor = page.getByPlaceholder("填写这一段视频的动作描述");
  await editor.fill("pick and place the object");
  await expect.poll(() => draftCalls, { timeout: 5000 }).toBeGreaterThan(0);

  await page.getByRole("button", { name: "清空全部标注" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button").last().click();
  await expect.poll(() => clearCalls).toBe(1);
  await expect(page.locator(".timeline-segment")).toHaveCount(1);
  await expect(page.locator(".timeline-segment")).toContainText("未填写");

  await page.reload();
  await expect(page.getByText("pick the object").first()).toBeVisible();
  await page.getByRole("button", { name: "提交审核" }).click();
  await expect.poll(() => submitCalls).toBe(1);
  await expect(page).toHaveURL(/\/packages$/);
});

test("reviewer can approve an assigned task", async ({ page }) => {
  await mockShell(page, reviewer);
  let reviewDecision: string | undefined;
  await page.route("**/api/v1/work-items/item-1/review", async (route) => {
    const body = route.request().postDataJSON() as { decision?: string };
    reviewDecision = body.decision;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...annotatorItem, status: "completed", reviewer_id: reviewer.id }),
    });
  });

  await page.goto("/packages");
  await page.goto("/work/item-1");
  await expect(page.getByText("待审核")).toBeVisible();
  await expect(page.getByRole("button", { name: "审核通过" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "保存草稿" })).not.toBeVisible();
  await page.getByRole("button", { name: "审核通过" }).click();
  await expect.poll(() => reviewDecision).toBe("approve");
  await expect(page).toHaveURL(/\/packages$/);
});
