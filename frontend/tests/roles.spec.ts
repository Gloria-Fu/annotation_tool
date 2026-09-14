import { expect, test } from "@playwright/test";

const roles = [
  { role: "developer_admin", home: "/dashboard" },
  { role: "annotation_manager", home: "/dashboard" },
  { role: "outsourcing_manager", home: "/packages" },
  { role: "reviewer", home: "/packages" },
  { role: "annotator", home: "/packages" },
] as const;

for (const { role, home } of roles) {
  test(`${role} reaches its role home`, async ({ page }) => {
    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: `${role}-id`,
          username: role,
          display_name: role,
          role,
          is_active: true,
          must_change_password: false,
        }),
      }),
    );
    await page.route("**/api/v1/projects", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: "project-1", name: "测试项目", is_active: true }]),
      }),
    );

    await page.goto("/");
    await expect(page).toHaveURL(new RegExp(`${home}$`));
    if (role === "reviewer") {
      await expect(page.getByRole("menuitem", { name: "我的质量抽检" })).toHaveCount(0);
      await page.goto("/quality");
      await expect(page).toHaveURL(/\/packages$/);
    }
  });
}

test("navigation sidebar can be hidden and restored", async ({ page }) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "admin-id",
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
      body: JSON.stringify([{ id: "project-1", name: "测试项目", is_active: true }]),
    }),
  );

  await page.goto("/");
  const menuItem = page.getByRole("menuitem", { name: "任务包" });
  const toggle = page.getByRole("button", { name: /导航栏/ });
  await expect(toggle).toBeVisible();

  if ((await toggle.getAttribute("aria-label")) === "展开导航栏") {
    await expect(menuItem).toBeHidden();
    await toggle.click();
    await expect(menuItem).toBeVisible();
  } else {
    await expect(menuItem).toBeVisible();
  }

  await page.getByRole("button", { name: "隐藏导航栏" }).click();
  await expect(page.getByRole("menuitem", { name: "任务包" })).toBeHidden();

  await page.getByRole("button", { name: "展开导航栏" }).click();
  await expect(page.getByRole("menuitem", { name: "任务包" })).toBeVisible();
});
