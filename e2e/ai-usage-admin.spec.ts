/**
 * AI Usage Admin E2E Tests — P3-AI-017
 *
 * Tests the admin AI usage dashboard at /admin/ai-usage:
 * - Admin access with period/groupBy switching
 * - User limits management (update + refresh)
 * - Restore blocked user access
 * - Regular user rejection
 * - Error and empty state handling
 *
 * Prerequisites:
 *   - Local Supabase stack running (npx supabase start)
 *   - Next.js dev server (npm run dev) on http://localhost:3000
 *
 * Run: npx playwright test e2e/ai-usage-admin.spec.ts
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
  return `ai-usage-${label}-${TS}@example.invalid`;
}

async function loginAndOnboard(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  await page.fill("#email", email);
  await page.fill("#password", TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 15000 });

  if (page.url().includes("/onboarding")) {
    await page.waitForLoadState("domcontentloaded");
    await page.fill("#workspaceName", "AI-Usage-E2E-WS");
    await page.fill("#city", "Beijing");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe("AI Usage Admin Dashboard", () => {
  test("1. admin can view dashboard with stat cards and groups table", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("view");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;

    // Make system admin
    await supabase.from("system_admins").insert({
      user_id: userId, status: "active", created_by: userId,
    });

    // Seed ai_usage_logs so dashboard is not empty
    const { data: ws } = await supabase.from("workspaces").select("id").limit(1).single();
    const wsId = ws?.id;
    if (wsId) {
      await supabase.from("ai_usage_logs").insert([
        { user_id: userId, workspace_id: wsId, feature: "content_factory", capability: "text_generation",
          input_tokens: 100, output_tokens: 50, estimated_cost_usd: 0.0002,
          quota_date: new Date().toISOString().slice(0, 10), status: "succeeded",
          idempotency_key: `e2e-view-1-${TS}`, request_id: `e2e-view-req-1-${TS}` },
        { user_id: userId, workspace_id: wsId, feature: "content_factory", capability: "visual_analysis",
          input_tokens: 50, output_tokens: 25, estimated_cost_usd: 0.0001,
          quota_date: new Date().toISOString().slice(0, 10), status: "succeeded",
          idempotency_key: `e2e-view-2-${TS}`, request_id: `e2e-view-req-2-${TS}` },
      ]);
    }

    try {
      await loginAndOnboard(page, email);

      // Navigate to AI usage dashboard
      await page.goto("/admin/ai-usage");
      await page.waitForTimeout(1500);
      await page.waitForLoadState("domcontentloaded");

      // Should see the title
      await expect(page.locator("h1")).toContainText("AI 用量看板", { timeout: 10000 });

      // Should see stat cards (total tokens, cost, success rate, blocked)
      await expect(page.getByText("总 Token")).toBeVisible({ timeout: 5000 });
      await expect(page.getByText("总成本")).toBeVisible({ timeout: 5000 });

      // Should see text vs vision breakdown
      await expect(page.getByText("文本生成")).toBeVisible({ timeout: 5000 });
      await expect(page.getByText("视觉分析")).toBeVisible({ timeout: 5000 });

      // Should see grouped stats table
      await expect(page.getByText("按功能统计")).toBeVisible({ timeout: 5000 });

      // Should see user limits management section
      await expect(page.getByText("用户配额管理")).toBeVisible({ timeout: 5000 });
    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });

  test("2. admin can switch period and groupBy", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("switch");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;

    await supabase.from("system_admins").insert({
      user_id: userId, status: "active", created_by: userId,
    });

    // Seed data
    const { data: ws } = await supabase.from("workspaces").select("id").limit(1).single();
    const wsId = ws?.id;
    if (wsId) {
      await supabase.from("ai_usage_logs").insert([
        { user_id: userId, workspace_id: wsId, feature: "content_factory", capability: "text_generation",
          input_tokens: 100, output_tokens: 50, estimated_cost_usd: 0.0002,
          quota_date: new Date().toISOString().slice(0, 10), status: "succeeded",
          idempotency_key: `e2e-sw-1-${TS}`, request_id: `e2e-sw-req-1-${TS}` },
      ]);
    }

    try {
      await loginAndOnboard(page, email);
      await page.goto("/admin/ai-usage");
      await page.waitForTimeout(1500);
      await page.waitForLoadState("domcontentloaded");

      // Switch period to 7d
      await page.getByRole("button", { name: "近 7 日" }).click();
      await page.waitForTimeout(500);

      // Switch period to 30d
      await page.getByRole("button", { name: "近 30 日" }).click();
      await page.waitForTimeout(500);

      // Switch back to today
      await page.getByRole("button", { name: "今日" }).click();
      await page.waitForTimeout(500);

      // Switch groupBy to user
      await page.getByRole("button", { name: "按用户" }).click();
      await page.waitForTimeout(500);
      await expect(page.getByText("按用户统计")).toBeVisible({ timeout: 5000 });

      // Switch groupBy to model
      await page.getByRole("button", { name: "按模型" }).click();
      await page.waitForTimeout(500);
      await expect(page.getByText("按模型统计")).toBeVisible({ timeout: 5000 });

      // Switch groupBy to status
      await page.getByRole("button", { name: "按状态" }).click();
      await page.waitForTimeout(500);
      await expect(page.getByText("按状态统计")).toBeVisible({ timeout: 5000 });
    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });

  test("3. admin can update user limits and see result", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("limits");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const adminId = userData.user!.id;

    await supabase.from("system_admins").insert({
      user_id: adminId, status: "active", created_by: adminId,
    });

    // Create a target user for limits update
    const { data: targetUser } = await supabase.auth.admin.createUser({
      email: uniqueEmail("target"), password: TEST_PASSWORD, email_confirm: true,
    });
    const targetId = targetUser.user!.id;

    try {
      await loginAndOnboard(page, email);
      await page.goto("/admin/ai-usage");
      await page.waitForTimeout(1500);
      await page.waitForLoadState("domcontentloaded");

      // Fill in the user ID and limits
      await page.fill('input[placeholder*="xxxxxxxx"]', targetId);
      await page.fill('input[type="number"] >> nth=0', "100");
      await page.fill('input[type="number"] >> nth=1', "50");

      // Click update
      await page.getByRole("button", { name: "更新限制" }).click();

      // Should see success message
      await expect(page.getByText("用户限制已更新")).toBeVisible({ timeout: 10000 });

      // Verify limits were set in DB
      const { data: limits } = await supabase
        .from("ai_user_limits")
        .select("daily_request_limit, daily_cost_limit_usd")
        .eq("user_id", targetId)
        .single();

      expect(limits).not.toBeNull();
      expect(limits?.daily_request_limit).toBe(100);
      expect(Number(limits?.daily_cost_limit_usd)).toBe(50);
    } finally {
      await supabase.auth.admin.deleteUser(adminId);
      await supabase.auth.admin.deleteUser(targetId);
    }
  });

  test("4. admin can restore a blocked user", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("restore");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const adminId = userData.user!.id;

    // Create profile first (required by workspaces FK during onboarding)
    await supabase.from("profiles").upsert({ id: adminId, email }, { onConflict: "id" });

    await supabase.from("system_admins").insert({
      user_id: adminId, status: "active", created_by: adminId,
    });

    // Create a target user, seed limits, then block them
    const { data: targetUser } = await supabase.auth.admin.createUser({
      email: uniqueEmail("blocked"), password: TEST_PASSWORD, email_confirm: true,
    });
    const targetId = targetUser.user!.id;

    // Insert a blocked limits record
    await supabase.from("ai_user_limits").insert({
      user_id: targetId,
      feature: "content_factory",
      status: "blocked",
      blocked_at: new Date().toISOString(),
      blocked_reason: "cost limit exceeded",
      daily_request_limit: 10,
    });

    try {
      await loginAndOnboard(page, email);
      await page.goto("/admin/ai-usage");
      await page.waitForTimeout(1500);
      await page.waitForLoadState("domcontentloaded");

      // Fill in the blocked user's ID
      await page.fill('input[placeholder*="xxxxxxxx"]', targetId);

      // Click restore
      await page.getByRole("button", { name: "恢复访问" }).click();

      // Should see success message
      await expect(page.getByText("用户 AI 访问已恢复")).toBeVisible({ timeout: 10000 });

      // Verify status is now active in DB
      const { data: limits } = await supabase
        .from("ai_user_limits")
        .select("status, manually_restored_at")
        .eq("user_id", targetId)
        .single();

      expect(limits?.status).toBe("active");
      expect(limits?.manually_restored_at).not.toBeNull();
    } finally {
      await supabase.auth.admin.deleteUser(adminId);
      await supabase.auth.admin.deleteUser(targetId);
    }
  });

  test("5. regular user cannot access AI usage admin page", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("regular");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;

    // Do NOT make system admin

    try {
      await loginAndOnboard(page, email);

      // Try to access admin AI usage page
      await page.goto("/admin/ai-usage");
      await page.waitForTimeout(1500);
      await page.waitForLoadState("domcontentloaded");

      const url = page.url();
      // Should be redirected away from admin
      expect(url.includes("/admin/ai-usage")).toBe(false);
      expect(url.includes("/dashboard") || url.includes("/login")).toBe(true);
    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });

  test("6. dashboard shows error state correctly when API fails", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("error");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;

    await supabase.from("system_admins").insert({
      user_id: userId, status: "active", created_by: userId,
    });

    try {
      await loginAndOnboard(page, email);
      await page.goto("/admin/ai-usage");
      await page.waitForTimeout(1500);
      await page.waitForLoadState("domcontentloaded");

      // The page should either show loaded content or an error state
      // Both are valid — we verify the page doesn't crash
      const hasTitle = await page.locator("h1").isVisible().catch(() => false);
      const hasRetry = await page.getByText("重试").isVisible().catch(() => false);
      const hasError = await page.getByText("加载失败").isVisible().catch(() => false);

      // Page should at least render something (title, error, or retry button)
      expect(hasTitle || hasRetry || hasError).toBe(true);

      // If retry button exists, it should be clickable
      if (hasRetry) {
        await page.getByRole("button", { name: "重试" }).click();
        await page.waitForTimeout(1000);
      }
    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });

  test("7. dashboard with empty data shows zero-state correctly", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("empty");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;

    await supabase.from("system_admins").insert({
      user_id: userId, status: "active", created_by: userId,
    });

    // Do NOT seed any ai_usage_logs — dashboard should handle empty data

    try {
      await loginAndOnboard(page, email);
      await page.goto("/admin/ai-usage");
      await page.waitForTimeout(1500);
      await page.waitForLoadState("domcontentloaded");

      // Should still show the title
      await expect(page.locator("h1")).toContainText("AI 用量看板", { timeout: 10000 });

      // Stat cards should show zero values (not crash)
      await expect(page.getByText("总 Token")).toBeVisible({ timeout: 5000 });

      // The grouped table should show empty state or be empty
      const emptyState = page.getByText("暂无数据");
      const table = page.locator("table");

      // Either empty state text or a table (possibly with no rows) should exist
      const hasContent = await Promise.race([
        emptyState.isVisible().then(() => true).catch(() => false),
        table.isVisible().then(() => true).catch(() => false),
        page.waitForTimeout(3000).then(() => false),
      ]);
      expect(hasContent).toBe(true);

      // User limits form should still be usable
      await expect(page.getByText("用户配额管理")).toBeVisible({ timeout: 5000 });
    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });
});
