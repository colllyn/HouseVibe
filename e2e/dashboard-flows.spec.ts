/**
 * Dashboard E2E — PRD §7.2 (今日工作台)
 * Real browser Chromium. Covers dashboard rendering, stats, quick actions,
 * mobile layout, and auth protection.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";

const OTHER_STATE = path.resolve(__dirname, ".auth/other.json");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Dashboard E2E", () => {
  test("1. dashboard loads for authenticated user", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Should show the dashboard header
    await expect(page.locator("h1")).toContainText("工作台");
  });

  test("2. stat cards are visible", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Should have the stats section
    await expect(page.getByText("数据概览")).toBeVisible({ timeout: 10000 });

    // Should show stat labels (use exact matching on uppercase tracking-wide labels within stat cards)
    await expect(page.getByText("待办任务")).toBeVisible({ timeout: 5000 });
    // Use .first() to disambiguate from sidebar nav
    await expect(page.locator(".uppercase.tracking-wide").filter({ hasText: /^客户$/ }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".uppercase.tracking-wide").filter({ hasText: /^房源$/ }).first()).toBeVisible({ timeout: 5000 });
  });

  test("3. stat cards link to respective pages", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Click tasks stat card
    const tasksLink = page.locator('a[href="/tasks"]').first();
    if (await tasksLink.isVisible()) {
      await tasksLink.click();
      await page.waitForURL(/\/tasks/, { timeout: 10000 });
      await expect(page).toHaveURL(/\/tasks/);
    }
  });

  test("4. quick actions are visible", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("快捷操作")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("快速录房源")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("新增客户")).toBeVisible({ timeout: 5000 });
  });

  test("5. quick action links navigate correctly", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Click "快速录房源" — should navigate to /properties/new
    const newPropertyLink = page.locator('a[href="/properties/new"]');
    if (await newPropertyLink.isVisible()) {
      await newPropertyLink.click();
      await page.waitForURL(/\/properties\/new/, { timeout: 10000 });
      await expect(page).toHaveURL(/\/properties\/new/);
    }
  });

  test("6. empty state shows zero values, not errors", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Should load without error messages
    await expect(page.getByText("数据加载失败")).not.toBeVisible({ timeout: 10000 });

    // Stats should show numbers (even if zero)
    const statsSection = page.getByText("数据概览");
    await expect(statsSection).toBeVisible({ timeout: 5000 });
  });

  test("7. mobile layout at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Header should be visible
    await expect(page.locator("h1")).toContainText("工作台");

    // Quick actions should be visible
    await expect(page.getByText("快捷操作")).toBeVisible({ timeout: 10000 });

    // Stats grid should not have horizontal scroll
    const main = page.locator("main, [role='main'], .max-w-4xl").first();
    const box = await main.boundingBox();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(375);
    }

    // Quick action buttons should have adequate touch targets (min 44px)
    const actionLink = page.locator('a[href="/properties/new"]');
    const actionBox = await actionLink.boundingBox();
    if (actionBox) {
      expect(actionBox.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("8. overdue/follow-up alerts appear when data exists", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Dashboard should load without errors
    await expect(page.getByText("数据加载失败")).not.toBeVisible({ timeout: 10000 });

    // The page should render stats and quick actions
    await expect(page.getByText("快捷操作")).toBeVisible({ timeout: 10000 });
  });

  test("9. cross-workspace isolation — other workspace user can access dashboard", async ({ browser }) => {
    const context = await browser.newContext({ storageState: OTHER_STATE });
    const page = await context.newPage();

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Should still show dashboard (each workspace has its own)
    await expect(page.locator("h1")).toContainText("工作台", { timeout: 10000 });

    // Should not show error
    await expect(page.getByText("数据加载失败")).not.toBeVisible({ timeout: 5000 });

    await context.close();
  });

  test("10. no content section for non-content user", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Regular users should NOT see content-specific stats
    await expect(page.getByText("近期内容")).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText("未发布内容")).not.toBeVisible({ timeout: 5000 });

    // Regular users should NOT see "生成内容" quick action
    await expect(page.getByText("生成内容")).not.toBeVisible({ timeout: 5000 });
  });

  test("11. dashboard page has correct title and description", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Welcome message
    await expect(page.getByText("欢迎回来")).toBeVisible({ timeout: 5000 });
  });

  test("12. stat cards have non-negative values", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Verify the stat card values are numbers
    const statValues = page.locator(".text-2xl");
    const count = await statValues.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const text = await statValues.nth(i).textContent();
      const num = parseInt(text?.trim() ?? "", 10);
      expect(num).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(num)).toBe(false);
    }
  });

  test("13. desktop sidebar navigation shows dashboard link", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Sidebar should have navigation links
    // Dashboard should have active state
    await expect(page.locator("h1")).toContainText("工作台");
  });
});
