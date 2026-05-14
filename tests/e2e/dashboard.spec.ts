import { expect, test } from "@playwright/test";

test.describe("Dashboard scaffold", () => {
  test("renders KPIs, columns, and Jira-linked cards", async ({ page }) => {
    await page.goto("/");

    // Redirect to /dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // KPI tiles
    await expect(page.getByText("Points committed")).toBeVisible();
    await expect(page.getByText("Points to PR")).toBeVisible();
    await expect(page.getByText("% complete")).toBeVisible();
    await expect(page.getByText("Days remaining")).toBeVisible();

    // Burndown chart
    await expect(page.getByText("Burndown", { exact: true })).toBeVisible();

    // Columns
    for (const label of ["To Do", "In Progress", "In Review", "Peer Review"]) {
      await expect(page.getByRole("heading", { name: label })).toBeVisible();
    }

    // At least one ticket card links to Jira
    const firstCard = page
      .locator('a[href^="https://carevicinity.atlassian.net/browse/CV-"]')
      .first();
    await expect(firstCard).toHaveAttribute("target", "_blank");
    await expect(firstCard).toHaveAttribute("rel", /noreferrer/);

    // Out-of-scope tickets must not render
    await expect(page.getByText("Smoke test for /dashboard")).toHaveCount(0); // CV-1314 (testing)
    await expect(page.getByText("Initial Next.js project setup")).toHaveCount(0); // CV-1315 (done)
  });

  test("sprint selector changes URL", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByLabel("Select sprint").click();
    await page.getByRole("option", { name: "Sprint 41" }).click();
    await expect(page).toHaveURL(/sprint=sprint-41/);
  });
});
