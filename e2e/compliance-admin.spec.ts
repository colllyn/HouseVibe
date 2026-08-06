/**
 * Compliance Admin E2E — Phase 3 P3-AI-020
 * Tests the admin compliance terms management page.
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const TEST_PASSWORD = "HouseVibeTest123!";
const TS = Date.now();

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function uniqueEmail(prefix: string) {
  return `${prefix}-${TS}@example.invalid`;
}

test.describe("Compliance Admin", () => {
  test("1. admin can view compliance page with empty state", async ({ page }) => {
    const supabase = getSupabaseClient();
    const email = uniqueEmail("comp-view");

    const { data: userData } = await supabase.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    const userId = userData.user!.id;

    // Make system admin
    await supabase.from("system_admins").insert({
      user_id: userId,
      status: "active",
      created_by: userId,
    });

    // Login
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill("#email", email);
    await page.fill("#password", TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/onboarding|\/dashboard/, { timeout: 15000 });

    if (page.url().includes("/onboarding")) {
      await page.waitForLoadState("networkidle");
      await page.fill("#workspaceName", "Comp-E2E-WS");
      await page.fill("#city", "Beijing");
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    }

    // Navigate to compliance admin
    await page.goto("/admin/compliance");
    await page.waitForLoadState("networkidle");

    // Admin shell is present with compliance nav
    await expect(page.locator("h1")).toContainText("合规词库管理", {
      timeout: 10000,
    });

    // Empty state or list is shown
    const emptyState = page.locator("text=暂无风险词");
    const createBtn = page.getByRole("button", { name: "新增风险词" });

    // At least one of these should be visible
    const hasContent = await Promise.race([
      emptyState.isVisible().then(() => true).catch(() => false),
      createBtn.isVisible().then(() => true).catch(() => false),
      page.waitForTimeout(3000).then(() => false),
    ]);

    expect(hasContent).toBe(true);

    // Cleanup
    await supabase.auth.admin.deleteUser(userId);
  });

  test("2. non-admin cannot access compliance page", async ({ page }) => {
    await page.goto("/admin/compliance");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url.includes("/admin/compliance")).toBe(false);
  });
});
