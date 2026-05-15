import { expect, test } from "@playwright/test";

test.describe("Dashboard — empty state", () => {
  test("shows the Sync from Jira CTA when DB is empty", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Connect to Jira")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sync from Jira" })).toBeVisible();
  });
});
