/**
 * Publishing Records E2E Tests — P3-AI-021
 *
 * Tests the /publishing page:
 * - Full lifecycle: create record → view in list → edit metrics → verify
 * - Feature denial for users without content_factory
 * - Empty state rendering
 * - Mobile layout at 375px
 *
 * Prerequisites:
 *   - Local Supabase stack running (npx supabase start)
 *   - Next.js dev server (npm run dev) on http://localhost:3000
 *
 * Run: npx playwright test e2e/publishing-records.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars for E2E");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const TS = Date.now();
const TEST_PASSWORD = "HouseVibeTest123!";

function uniqueEmail(label: string) {
  return `pub-${label}-${TS}@example.invalid`;
}

async function loginAndOnboard(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.fill("#email", email);
  await page.fill("#password", TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 15000 });

  if (page.url().includes("/onboarding")) {
    await page.waitForLoadState("networkidle");
    await page.fill("#workspaceName", "PUB-E2E-WS");
    await page.fill("#city", "Beijing");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe("Publishing Records CRUD", () => {
  test("1. full lifecycle: empty state → create → view → edit metrics", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("pub-lifecycle");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;

    // Grant content_factory feature
    await supabase.from("feature_entitlements").insert({
      user_id: userId, feature: "content_factory", status: "active", granted_by: userId,
    });

    // Create workspace + property + content project + version
    const wsId = crypto.randomUUID();
    const propId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const versionId = crypto.randomUUID();

    await supabase.from("workspaces").insert({
      id: wsId, name: "PUB-E2E-WS", owner_user_id: userId, city: "Beijing", business_type: "residential_lease",
    });
    await supabase.from("workspace_members").insert({
      id: crypto.randomUUID(), workspace_id: wsId, user_id: userId, role: "owner", status: "active",
    });
    await supabase.from("properties").insert({
      id: propId, workspace_id: wsId, created_by: userId,
      title: "Pub Test Apt", city: "Beijing", district: "Chaoyang",
      rental_type: "whole_unit", monthly_rent: 5000, status: "draft",
      allow_marketing_reuse: true,
    });
    await supabase.from("content_projects").insert({
      id: projectId, workspace_id: wsId, property_id: propId,
      platform: "douyin", created_by: userId, status: "draft",
    });
    await supabase.from("content_versions").insert({
      id: versionId, workspace_id: wsId, content_project_id: projectId,
      version_number: 1, model_name: "deepseek-v4-pro", prompt_version: "1.0.0",
      input_snapshot: {}, output_json: { body: "test" }, created_by: userId,
    });

    try {
      await loginAndOnboard(page, email);

      // Step 1: Navigate to /publishing
      await page.goto("/publishing");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("h1")).toContainText("发布记录", { timeout: 10000 });

      // Should see empty state
      const hasEmptyState = await page.getByText("暂无发布记录").isVisible().catch(() => false);
      expect(hasEmptyState).toBe(true);

      // Step 2: Click "添加记录"
      await page.getByText("添加记录").click();
      await page.waitForTimeout(500);

      // Should see create form
      await expect(page.getByText("添加发布记录")).toBeVisible({ timeout: 5000 });

      // Fill form (select project from dropdown)
      const projectSelect = page.locator("select").first();
      await projectSelect.selectOption({ index: 1 }); // Select first project
      await page.waitForTimeout(500);

      // Select version
      const versionSelect = page.locator("select").nth(1);
      await versionSelect.selectOption({ index: 1 }); // Select first version

      // Set published date
      const dateInput = page.locator("input[type='datetime-local']");
      await dateInput.fill("2026-08-06T10:00");

      // Submit
      await page.getByRole("button", { name: "保存" }).first().click();
      await page.waitForTimeout(1500);

      // Step 3: Record should appear in list (no longer empty)
      const notEmpty = await page.getByText("暂无发布记录").isHidden().catch(() => true);
      expect(notEmpty).toBe(true);

      // Step 4: Expand the record
      const recordCard = page.locator(".rounded-lg.border").first();
      await recordCard.click();
      await page.waitForTimeout(300);

      // Should see metrics grid and edit button
      await expect(page.getByText("编辑数据")).toBeVisible({ timeout: 5000 });

      // Step 5: Edit metrics
      await page.getByText("编辑数据").click();
      await page.waitForTimeout(300);

      // Fill in some metrics
      const viewInput = page.getByLabel("阅读");
      await viewInput.fill("1500");
      const leadInput = page.getByLabel("咨询");
      await leadInput.fill("3");

      // Save
      await page.getByRole("button", { name: "保存" }).last().click();
      await page.waitForTimeout(1000);

      // Verify metrics are displayed
      const hasViews = await page.getByText("1,500").isVisible().catch(() => false);
      const hasLeads = await page.getByText("3").isVisible().catch(() => false);
      expect(hasViews || hasLeads).toBe(true);

    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });

  test("2. user without content_factory is denied via API", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("pub-denied");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;

    // Do NOT grant content_factory
    const wsId = crypto.randomUUID();
    await supabase.from("workspaces").insert({
      id: wsId, name: "PUB-Denied-WS", owner_user_id: userId, city: "Beijing", business_type: "residential_lease",
    });
    await supabase.from("workspace_members").insert({
      id: crypto.randomUUID(), workspace_id: wsId, user_id: userId, role: "owner", status: "active",
    });

    try {
      await loginAndOnboard(page, email);
      await page.goto("/publishing");
      await page.waitForLoadState("networkidle");

      // Should see denied state
      const hasDenied = await page.getByText("需要内容工厂权限").isVisible().catch(() => false);
      expect(hasDenied).toBe(true);

      // API denial: attempt POST from within browser context
      const apiResult = await page.evaluate(async () => {
        try {
          const res = await fetch("/api/content/projects/00000000-0000-0000-0000-000000000000/publishing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content_version_id: "00000000-0000-0000-0000-000000000000",
              platform: "xiaohongshu",
              published_at: "2026-08-06T10:00:00Z",
            }),
          });
          return { status: res.status };
        } catch {
          return { status: 0 };
        }
      });
      expect(apiResult.status).toBe(403);
    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });

  test("3. mobile viewport: publishing page is usable at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const supabase = getSupabaseClient();
    const email = uniqueEmail("pub-mobile");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;

    await supabase.from("feature_entitlements").insert({
      user_id: userId, feature: "content_factory", status: "active", granted_by: userId,
    });

    const wsId = crypto.randomUUID();
    await supabase.from("workspaces").insert({
      id: wsId, name: "PUB-Mobile-WS", owner_user_id: userId, city: "Beijing", business_type: "residential_lease",
    });
    await supabase.from("workspace_members").insert({
      id: crypto.randomUUID(), workspace_id: wsId, user_id: userId, role: "owner", status: "active",
    });

    try {
      await loginAndOnboard(page, email);
      await page.goto("/publishing");
      await page.waitForLoadState("networkidle");

      // Title visible
      await expect(page.locator("h1")).toContainText("发布记录", { timeout: 10000 });

      // "添加记录" button visible
      await expect(page.getByText("添加记录")).toBeVisible({ timeout: 5000 });

      // Filter visible
      const filterLabel = page.getByLabel("平台筛选");
      await expect(filterLabel).toBeVisible({ timeout: 5000 });

      // Create form works at mobile width
      await page.getByText("添加记录").click();
      await page.waitForTimeout(500);
      await expect(page.getByText("添加发布记录")).toBeVisible({ timeout: 5000 });

      // Form inputs are accessible
      const selects = page.locator("select");
      await expect(selects.first()).toBeVisible();

      // Cancel button works
      await page.getByText("取消").click();
      await page.waitForTimeout(300);
      await expect(page.getByText("暂无发布记录")).toBeVisible({ timeout: 5000 });

    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });
});
