import { expect, test } from "@playwright/test";

test("account delete opens confirmation dialog", async ({ page }) => {
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
          id: "target",
          username: "target",
          display_name: "测试用户",
          role: "annotator",
          is_active: true,
          must_change_password: false,
        },
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
  await page.goto("/users");
  await page.getByRole("button", { name: /删/ }).first().click();
  await expect(page.getByText("删除账号 target？")).toBeVisible();
});
