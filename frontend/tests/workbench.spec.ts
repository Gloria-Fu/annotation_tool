import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { SKILL_OPTIONS, isSkillEnabled } from "../src/features/workbench/skillAvailability";
import type { AnnotationPayload } from "../src/shared/api/types";

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
  await page.route("**/api/v1/work-items/item-1/draft", (route) =>
    route.fulfill({ json: annotatorItem }),
  );
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
  await expect(page.locator(".segment-editor")).not.toContainText("原标注句");

  const track = page.locator(".timeline-track");
  await track.click({ position: { x: 550, y: 95 } });
  await page.getByRole("button", { name: "分段" }).click();
  await expect(page.locator(".timeline-segment")).toHaveCount(2);
  await expect(page.getByText("未填写")).toBeVisible();

  await page.locator(".timeline-segment").first().click();
  await track.click({ position: { x: 250, y: 95 } });
  await page.keyboard.press("Space");
  await expect(page.locator(".timeline-segment")).toHaveCount(3);

  await page.getByTitle("撤销").click();
  await expect(page.locator(".timeline-segment")).toHaveCount(2);
  await page.getByTitle("重做").click();
  await expect(page.locator(".timeline-segment")).toHaveCount(3);

  const divider = page.getByLabel("拖动调整片段分界").first();
  const dividerBox = await divider.boundingBox();
  expect(dividerBox).not.toBeNull();
  if (dividerBox) {
    await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + 5);
    await page.mouse.down();
    await page.mouse.move(dividerBox.x + 30, dividerBox.y + 5);
    await page.mouse.up();
  }

  await page.getByRole("combobox", { name: "技能", exact: true }).click();
  await page.getByTitle("拾取 (Pick)", { exact: true }).click();
  const sentence = page.getByLabel("标注句编辑器");
  await sentence.getByRole("combobox", { name: "操作手", exact: true }).click();
  await page.locator(".ant-select-dropdown:visible").getByTitle("左手", { exact: true }).click();
  await sentence.getByRole("textbox", { name: "物体名称", exact: true }).fill("黄瓜");
  await sentence.getByRole("textbox", { name: "夹爪初始位置", exact: true }).fill("货架前侧");
  await expect(page.locator(".fine-preview")).toContainText("左手夹爪初始位于货架前侧");
  await expect(page.getByRole("button", { name: "提交审核" })).toBeDisabled();
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

test("skill selection switches sentence fields without losing shared input", async ({
  page,
}, testInfo) => {
  await mockShell(page, annotator);
  await page.goto("/work/item-1");
  const selector = page.locator(".sentence-skill .ant-select-selector");
  await selector.click();
  await expect(page.locator(".ant-select-dropdown:visible .ant-select-item-option")).toHaveCount(
    SKILL_OPTIONS.length,
  );
  await page.getByTitle("拾取 (Pick)", { exact: true }).click();
  await page.getByRole("textbox", { name: "物体名称", exact: true }).fill("黄瓜");
  await expect(page.getByRole("textbox", { name: "原支撑面", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "靠近目标位置", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "物体结束位置", exact: true })).toHaveCount(0);
  await expect(page.getByText("请先选择操作手", { exact: true })).toBeVisible();
  for (const [skill, label, field] of [
    ["Place", "放置 (Place)", "放置位置"],
    ["Grasp", "抓握 (Grasp)", "接触部位"],
    ["Push", "推动 (Push)", "推动方向"],
    ["Pull", "拉动 (Pull)", "拉动方向"],
  ]) {
    if (!isSkillEnabled(skill)) continue;
    await selector.click();
    await page.getByTitle(label, { exact: true }).click();
    await expect(page.getByRole("textbox", { name: field, exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "物体名称", exact: true })).toHaveValue("黄瓜");
    await expect(page.getByRole("textbox", { name: "原支撑面", exact: true })).toHaveCount(0);
  }
  await page.getByRole("heading", { name: "Episode 0" }).click();
  await expect(page.locator(".ant-select-dropdown:visible")).toHaveCount(0);
  const leftBefore = await page.locator(".workbench-main").boundingBox();
  const resultBefore = await page.getByRole("region", { name: "最终标注结果" }).boundingBox();
  await page.locator(".editor-fields").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByRole("button", { name: "保存草稿" })).toBeInViewport();
  expect(
    await page.locator(".editor-fields").evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.locator(".workbench-main").boundingBox()).toEqual(leftBefore);
  await expect(page.getByRole("region", { name: "最终标注结果" })).toBeInViewport();
  expect(await page.getByRole("region", { name: "最终标注结果" }).boundingBox()).toEqual(
    resultBefore,
  );
  await page.screenshot({ path: testInfo.outputPath("independent-scroll.png") });
  await page
    .locator(".segment-editor")
    .screenshot({ path: testInfo.outputPath("skill-editor.png") });
  expect(
    await page
      .locator(".segment-editor")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
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

test("Pick saves and reloads both jaw landmarks", async ({ page }, testInfo) => {
  await mockShell(page, annotator);
  let payload: AnnotationPayload = contextFor(annotatorItem, annotator.id).latest_revision.payload;
  await page.route("**/api/v1/work-items/item-1/context", (route) => {
    const context = contextFor(annotatorItem, annotator.id);
    return route.fulfill({
      json: {
        ...context,
        video_urls: { head: "/test-video.mp4" },
        latest_revision: { ...context.latest_revision, payload },
      },
    });
  });
  const media = await readFile("tests/fixtures/keyframe.mp4");
  await page.route("**/test-video.mp4", (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || "");
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      contentType: "video/mp4",
      headers: {
        "Accept-Ranges": "bytes",
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${media.length}` } : {}),
      },
      body: media.subarray(start, end + 1),
    });
  });
  await page.route("**/api/v1/work-items/item-1/draft", async (route) => {
    payload = (route.request().postDataJSON() as { payload: AnnotationPayload }).payload;
    await route.fulfill({ json: annotatorItem });
  });
  await page.goto("/work/item-1");
  await page.getByRole("combobox", { name: "技能", exact: true }).click();
  await page.getByTitle("拾取 (Pick)", { exact: true }).click();
  await expect
    .poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("combobox", { name: "操作手", exact: true }).click();
  await page.locator(".ant-select-dropdown:visible").getByTitle("左手", { exact: true }).click();
  await expect(page.getByRole("button", { name: "标记右手", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "标记左手", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /关键帧精细标记/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "确认标记" })).toBeDisabled();
  const snapshot = dialog.getByAltText("HEAD 关键帧");
  await expect
    .poll(() => snapshot.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(640);
  expect(
    await snapshot.evaluate((image: HTMLImageElement) => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, 640, 480).data;
      return data.some((value, index) => index % 4 !== 3 && value > 100);
    }),
  ).toBe(true);
  for (const [label, ratio] of [
    ["左夹", 0.3],
    ["右夹", 0.7],
  ] as const) {
    await dialog.getByText(label, { exact: true }).first().click();
    const target = dialog.locator(".gripper-mark-stage");
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    await target.click({ position: { x: box!.width * ratio, y: box!.height / 2 } });
    await expect(dialog.getByRole("button", { name: label + "标记点", exact: true })).toBeVisible();
  }
  const beforeZoom = await dialog.locator(".gripper-mark-status").textContent();
  await dialog.getByRole("button", { name: "放大画面" }).click();
  await expect(dialog.locator(".gripper-zoom-value")).not.toHaveText("100%");
  await expect(dialog.locator(".gripper-mark-status")).toHaveText(beforeZoom!);
  await dialog.getByText("平移", { exact: true }).click();
  const stageBefore = await dialog.locator(".gripper-mark-stage").boundingBox();
  const viewportBox = (await dialog.locator(".gripper-mark-viewport").boundingBox())!;
  await page.mouse.move(
    viewportBox.x + viewportBox.width / 2,
    viewportBox.y + viewportBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    viewportBox.x + viewportBox.width / 2 + 30,
    viewportBox.y + viewportBox.height / 2 + 20,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await dialog.locator(".gripper-mark-stage").boundingBox())?.x)
    .not.toBe(stageBefore!.x);
  await expect(dialog.locator(".gripper-mark-status")).toHaveText(beforeZoom!);
  await dialog.getByText("标点", { exact: true }).click();
  const leftMarker = (await dialog.getByRole("button", { name: "左夹标记点" }).boundingBox())!;
  await page.mouse.move(leftMarker.x + leftMarker.width / 2, leftMarker.y + leftMarker.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    leftMarker.x + leftMarker.width / 2 + 12,
    leftMarker.y + leftMarker.height / 2 + 8,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(dialog.locator(".gripper-mark-status")).not.toHaveText(beforeZoom!);
  await page.keyboard.press("Space");
  await expect(page.locator(".timeline-segment")).toHaveCount(1);
  await dialog.getByRole("button", { name: "适应窗口" }).click();
  await expect(dialog.locator(".gripper-zoom-value")).toHaveText("100%");
  await dialog.locator(".ant-modal-title").click();
  await expect(dialog.getByRole("button", { name: "确认标记" })).toBeInViewport();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("pick-precision-modal.png") });
  await dialog.getByRole("button", { name: "确认标记" }).click();
  await expect(page.locator(".video-keyframe-point")).toHaveCount(2);
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect
    .poll(() => payload.segments?.[0].fine_annotation?.gripper_keyframes?.left?.right)
    .toBeTruthy();
  const points = payload.segments![0].fine_annotation!.gripper_keyframes!.left!;
  expect(points.frame).toBe(0);
  expect(points.view).toBe("head");
  expect(points.left?.visibility).toBe("visible");
  expect(points.right?.visibility).toBe("visible");
  await page.screenshot({ path: testInfo.outputPath("pick-jaw-points.png") });
  await page.reload();
  await expect(page.getByRole("button", { name: "重新标记左手", exact: true })).toBeVisible();
  await expect
    .poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "重新标记左手", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "左夹标记点" })).toBeVisible();
  const saved = JSON.stringify(payload.segments![0].fine_annotation!.gripper_keyframes);
  await dialog.locator(".gripper-mark-stage").click({ position: { x: 50, y: 50 } });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  expect(JSON.stringify(payload.segments![0].fine_annotation!.gripper_keyframes)).toBe(saved);
  await page
    .locator(".ant-select-selector")
    .filter({ has: page.getByRole("combobox", { name: "操作手", exact: true }) })
    .click();
  await page.locator(".ant-select-dropdown:visible").getByTitle("双手", { exact: true }).click();
  await expect(page.getByRole("button", { name: "重新标记左手", exact: true })).toBeVisible();
  await page.locator("video").evaluate((video: HTMLVideoElement) => {
    video.currentTime = 1;
  });
  await expect
    .poll(() =>
      page.locator("video").evaluate((video: HTMLVideoElement) => ({
        time: video.currentTime,
        seeking: video.seeking,
        ready: video.readyState >= 2,
      })),
    )
    .toEqual({ time: 1, seeking: false, ready: true });
  await page.getByRole("button", { name: "标记右手", exact: true }).click();
  await expect(dialog).toHaveAccessibleName(/右手 · HEAD · 帧 10/);
  await dialog.getByRole("checkbox", { name: "左夹不可见" }).check();
  await expect(dialog.getByRole("button", { name: "确认标记" })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "右夹不可见" }).check();
  await expect(dialog.getByRole("button", { name: "确认标记" })).toBeEnabled();
  await dialog.getByRole("checkbox", { name: "右夹不可见" }).uncheck();
  await expect(dialog.getByRole("button", { name: "确认标记" })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "右夹不可见" }).check();
  await expect(dialog.getByRole("button", { name: "确认标记" })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("right-hand-invisible.png") });
  await dialog.getByRole("button", { name: "确认标记" }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect
    .poll(() => payload.segments?.[0].fine_annotation?.gripper_keyframes?.right?.frame)
    .toBe(10);
  expect(payload.segments![0].fine_annotation!.gripper_keyframes!.left).toEqual(points);
  expect(payload.segments![0].fine_annotation!.gripper_keyframes!.right).toEqual({
    frame: 10,
    view: "head",
    left: { visibility: "invisible" },
    right: { visibility: "invisible" },
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "重新标记左手", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "重新标记右手", exact: true })).toBeVisible();
});
