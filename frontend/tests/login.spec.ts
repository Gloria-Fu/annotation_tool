import { expect, test } from "@playwright/test";

test("login page is usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "标注管理平台" })).toBeVisible();
  await expect(page.getByLabel("用户名")).toBeVisible();
  await expect(page.getByLabel("密码")).toBeVisible();
  await expect(page.getByRole("button", { name: "登 录" })).toBeEnabled();
});

test("invalid login reports a clear error", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("用户名").fill("unknown-user");
  await page.getByLabel("密码").fill("not-the-password");
  await page.getByRole("button", { name: "登 录" }).click();
  await expect(page.getByText("用户名或密码错误")).toBeVisible();
});
