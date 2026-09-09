import { expect, test } from "@playwright/test";

const roles = [
  { role: "developer_admin", home: "/dashboard" },
  { role: "annotation_manager", home: "/dashboard" },
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
  });
}
