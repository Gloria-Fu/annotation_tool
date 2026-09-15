import { expect, test, type Page } from "@playwright/test";

const targetUser = {
  id: "target",
  username: "target",
  display_name: "测试用户",
  role: "annotator",
  is_active: true,
  must_change_password: false,
};

async function mockUsersPage(page: Page, role: string) {
  const currentUser = {
    id: "admin",
    username: "admin",
    display_name: role === "outsourcing_manager" ? "合作方负责人" : "管理员",
    role,
    is_active: true,
    must_change_password: false,
  };
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(currentUser),
    }),
  );
  await page.route("**/api/v1/projects", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "project", name: "测试项目", is_active: true }]),
    }),
  );
  await page.route("**/api/v1/user-groups", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    }),
  );
  await page.route("**/api/v1/users", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([targetUser, currentUser]),
    }),
  );
}

test("account delete opens confirmation dialog", async ({ page }) => {
  await mockUsersPage(page, "developer_admin");
  await page.goto("/users");
  await page.getByRole("button", { name: /删/ }).first().click();
  await expect(page.getByText("删除账号 target？")).toBeVisible();
});

for (const role of ["developer_admin", "outsourcing_manager"] as const) {
  test(`${role} can reset a user's password`, async ({ page }) => {
    await mockUsersPage(page, role);
    let resetPassword: string | undefined;
    await page.route("**/api/v1/users/target", async (route) => {
      const body = route.request().postDataJSON() as { reset_password?: string };
      resetPassword = body.reset_password;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...targetUser, must_change_password: true }),
      });
    });

    await page.goto("/users");
    await page.getByRole("button", { name: "重置密码" }).first().click();
    await expect(page.getByRole("dialog")).toContainText("重置 target 的密码");
    await page.getByLabel("新密码", { exact: true }).fill("new-password-1234");
    await page.getByLabel("确认新密码", { exact: true }).fill("new-password-1234");
    await page.getByRole("button", { name: "确认重置" }).click();

    await expect.poll(() => resetPassword).toBe("new-password-1234");
    await expect(
      page.getByRole("dialog", { name: `重置 ${targetUser.username} 的密码` }),
    ).toHaveCount(0);
  });
}

test("annotation manager cannot see password reset actions", async ({ page }) => {
  await mockUsersPage(page, "annotation_manager");

  await page.goto("/users");

  await expect(page.getByRole("button", { name: "重置密码" })).toHaveCount(0);
});
