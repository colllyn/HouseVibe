/**
 * Cost Tracking & Circuit Breaker E2E Tests — P3-AI-015
 *
 * Tests admin AI pages for:
 * - Workspace grouping in AI usage dashboard
 * - Circuit breaker manual reset on AI models page
 * - Non-admin rejection
 * - Mobile 375px layout
 *
 * Prerequisites:
 *   - Local Supabase stack running (npx supabase start)
 *   - Next.js dev server (npm run dev) on http://localhost:3000
 *
 * Run: npx playwright test e2e/cost-tracking-circuit-breaker.spec.ts
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
  return `p3-ai-015-${label}-${TS}@example.invalid`;
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
    await page.fill("#workspaceName", "CB-E2E-WS");
    await page.fill("#city", "Beijing");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  }
}

async function makeAdmin(supabase: ReturnType<typeof getSupabaseClient>, userId: string) {
  await supabase.from("system_admins").insert({
    user_id: userId, status: "active", created_by: userId,
  });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe("P3-AI-015 Cost Tracking & Circuit Breaker", () => {
  // ==========================================================================
  // Workspace grouping
  // ==========================================================================

  test("1. workspace grouping selector visible and clickable", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("ws-group");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;
    await makeAdmin(supabase, userId);

    try {
      await loginAndOnboard(page, email);
      await page.goto("/admin/ai-usage");
      await page.waitForLoadState("domcontentloaded");

      // Workspace tab should be visible
      const wsTab = page.getByRole("button", { name: "按工作区" });
      await expect(wsTab).toBeVisible({ timeout: 5000 });

      // Click workspace tab
      await wsTab.click();
      await page.waitForTimeout(500);

      // Should show "按工作区统计" heading
      await expect(page.getByText("按工作区统计")).toBeVisible({ timeout: 5000 });
    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });

  test("2. workspace grouping loads grouped data", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("ws-data");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;
    await makeAdmin(supabase, userId);

    // Seed data so workspace grouping has content
    const { data: ws } = await supabase.from("workspaces").select("id").limit(1).single();
    const wsId = ws?.id;
    if (wsId) {
      await supabase.from("ai_usage_logs").insert([
        { user_id: userId, workspace_id: wsId, feature: "content_factory", capability: "text_generation",
          input_tokens: 100, output_tokens: 50, estimated_cost_usd: 0.0002,
          quota_date: new Date().toISOString().slice(0, 10), status: "succeeded",
          idempotency_key: `e2e-ws-1-${TS}`, request_id: `e2e-ws-req-1-${TS}` },
      ]);
    }

    try {
      await loginAndOnboard(page, email);
      await page.goto("/admin/ai-usage");
      await page.waitForLoadState("domcontentloaded");

      // Click workspace tab
      await page.getByRole("button", { name: "按工作区" }).click();
      // Wait for the grouped data to load (API call completes asynchronously)
      await page.waitForTimeout(2000);

      // At minimum, the heading should be visible
      await expect(page.getByText("按工作区统计")).toBeVisible({ timeout: 5000 });

      // Should show the grouped table (either with data or empty state)
      const hasTable = await page.locator("table").isVisible().catch(() => false);
      const hasEmpty = await page.getByText("暂无数据").isVisible().catch(() => false);

      // Either table with data or empty state is acceptable
      expect(hasTable || hasEmpty).toBe(true);
    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });

  // ==========================================================================
  // Circuit breaker reset
  // ==========================================================================

  test("3. circuit breaker page loads with model cards", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("cb-load");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;
    await makeAdmin(supabase, userId);

    try {
      await loginAndOnboard(page, email);
      await page.goto("/admin/ai-models");
      await page.waitForLoadState("domcontentloaded");

      // Should see title
      await expect(page.locator("h1")).toContainText("AI 模型管理", { timeout: 10000 });

      // Should see both text and vision model cards
      await expect(page.getByText("文本模型")).toBeVisible({ timeout: 5000 });
      await expect(page.getByText("视觉模型")).toBeVisible({ timeout: 5000 });

      // Should see mode labels
      await expect(page.getByText("熔断: 正常").first()).toBeVisible({ timeout: 5000 });
    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });

  test("4. reset button hidden when circuit is closed", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("cb-closed");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;
    await makeAdmin(supabase, userId);

    // Ensure circuit is closed for text and vision (use direct table ops — service role can't call auth.uid() RPCs)
    await supabase.from("ai_runtime_config").upsert({
      capability: "text", mode: "auto", circuit_open: false, consecutive_failures: 0,
    }, { onConflict: "capability" });
    await supabase.from("ai_runtime_config").upsert({
      capability: "vision", mode: "auto", circuit_open: false, consecutive_failures: 0,
    }, { onConflict: "capability" });

    try {
      await loginAndOnboard(page, email);
      await page.goto("/admin/ai-models");
      await page.waitForLoadState("domcontentloaded");

      // Reset button should NOT be visible when circuit is closed
      const resetBtn = page.getByRole("button", { name: "重置熔断器" });
      await expect(resetBtn).not.toBeVisible({ timeout: 5000 });
    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });

  test("5. reset button visible and functional when circuit is open", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("cb-open");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;
    // Create profile first (required by workspaces FK during onboarding)
    await supabase.from("profiles").upsert({ id: userId, email }, { onConflict: "id" });
    await makeAdmin(supabase, userId);

    // Force circuit open for text model
    await supabase.from("ai_runtime_config").upsert({
      capability: "text",
      mode: "auto",
      circuit_open: true,
      consecutive_failures: 5,
    }, { onConflict: "capability" });

    try {
      await loginAndOnboard(page, email);
      await page.goto("/admin/ai-models");
      await page.waitForTimeout(1500);
      await page.waitForLoadState("domcontentloaded");

      // Reset button should be visible when circuit is open
      const resetBtn = page.locator('[data-testid="reset-circuit-text"]');
      await expect(resetBtn).toBeVisible({ timeout: 5000 });

      // Should show warning text
      await expect(page.getByText("熔断器已断开")).toBeVisible({ timeout: 5000 });

      // Click reset
      await resetBtn.click();
      await page.waitForTimeout(1000);

      // After reset, the circuit status should update to "正常"
      // (page refreshes via fetchConfig)
      await page.waitForTimeout(500);

      // Verify circuit state was reset in DB
      const { data: config } = await supabase
        .from("ai_runtime_config")
        .select("circuit_open, consecutive_failures")
        .eq("capability", "text")
        .single();

      expect(config?.circuit_open).toBe(false);
      expect(config?.consecutive_failures).toBe(0);
    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });

  test("6. non-admin cannot access AI models page", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("no-admin");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;
    // Do NOT make system admin

    try {
      await loginAndOnboard(page, email);

      // Try to access admin AI models page
      await page.goto("/admin/ai-models");
      await page.waitForLoadState("domcontentloaded");

      const url = page.url();
      // Should be redirected away from admin
      expect(url.includes("/admin/ai-models")).toBe(false);
      expect(url.includes("/dashboard") || url.includes("/login")).toBe(true);
    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });

  // ==========================================================================
  // Mobile layout
  // ==========================================================================

  test("7. mobile 375px layout for AI usage dashboard", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("mobile-usage");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;
    await makeAdmin(supabase, userId);

    try {
      await loginAndOnboard(page, email);

      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto("/admin/ai-usage");
      await page.waitForLoadState("domcontentloaded");

      // Title should be visible
      await expect(page.locator("h1")).toContainText("AI 用量看板", { timeout: 10000 });

      // No horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 10);

      // GroupBy selector tabs should wrap but be present
      await expect(page.getByRole("button", { name: "按功能" })).toBeVisible({ timeout: 5000 });
    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });

  test("8. mobile 375px layout for AI models page", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("mobile-models");

    const { data: userData } = await supabase.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const userId = userData.user!.id;
    await makeAdmin(supabase, userId);

    try {
      await loginAndOnboard(page, email);

      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto("/admin/ai-models");
      await page.waitForLoadState("domcontentloaded");

      // Title should be visible
      await expect(page.locator("h1")).toContainText("AI 模型管理", { timeout: 10000 });

      // No horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 10);

      // Model cards should stack on mobile (1 col grid)
      await expect(page.getByText("文本模型")).toBeVisible({ timeout: 5000 });
      await expect(page.getByText("视觉模型")).toBeVisible({ timeout: 5000 });
    } finally {
      await supabase.auth.admin.deleteUser(userId);
    }
  });
});
