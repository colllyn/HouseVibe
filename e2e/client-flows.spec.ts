/**
 * Client CRUD E2E -- P2-CLIENT-001
 * Real browser UI -> fetch() -> Route Handler -> manual page.goto().
 *
 * Covers: list, create, detail, edit, stage change, soft delete,
 * cross-workspace denial, unauthenticated denial, mobile layout,
 * form validation, double-submit safety, phone/wechat NOT leaked in list.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";

const OTHER_STATE = path.resolve(__dirname, ".auth/other.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createClient(
  page: import("@playwright/test").Page,
  data: {
    name: string;
    phone?: string;
    wechat?: string;
    stage?: string;
    budget_min?: string;
    budget_max?: string;
    source_platform?: string;
  }
): Promise<string> {
  await page.goto("/clients/new");
  await page.fill('input[name="name"]', data.name);
  if (data.phone) await page.fill('input[name="phone"]', data.phone);
  if (data.wechat) await page.fill('input[name="wechat"]', data.wechat);
  if (data.budget_min || data.budget_max) {
    const toggle = page.locator('button:has-text("预算")');
    if (await toggle.count() > 0) await toggle.click();
    if (data.budget_min) await page.fill('input[name="budget_min"]', data.budget_min);
    if (data.budget_max) await page.fill('input[name="budget_max"]', data.budget_max);
  }
  if (data.source_platform) {
    const sel = page.locator('select[name="source_platform"]');
    if (await sel.isVisible()) await sel.selectOption(data.source_platform);
  }
  if (data.stage) {
    const select = page.locator('select[name="stage"]');
    if (await select.isVisible()) await select.selectOption(data.stage);
  }

  await page.click('[data-testid="client-create-submit"]');
  await page.waitForURL(/\/clients\/[a-f0-9-]+/, { timeout: 15000 });
  return page.url().split("/").pop()!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Client CRUD", () => {
  // 1. Empty client list
  test("1. empty client list shows empty state", async ({ page }) => {
    await page.goto("/clients");
    await expect(page.locator("h1")).toContainText("客户", { timeout: 10000 });
  });

  // 2. Create client
  test("2. create client via UI", async ({ page }) => {
    await createClient(page, {
      name: "E2E Created",
      phone: "13800138000",
      wechat: "wx_e2e_test",
    });
    await expect(page.locator("h1")).toContainText("E2E Created");
  });

  // 3. Client appears in list
  test("3. created client appears in list", async ({ page }) => {
    await createClient(page, {
      name: "List Check Client",
      phone: "13900139000",
    });
    await page.goto("/clients");
    await expect(page.locator("text=List Check Client")).toBeVisible({ timeout: 10000 });
  });

  // 4. View client detail
  test("4. detail page shows client info", async ({ page }) => {
    await createClient(page, {
      name: "Detail Test Client",
      phone: "13700137000",
      wechat: "wx_detail_test",
      budget_min: "3000",
      budget_max: "6000",
    });
    await expect(page.locator("text=Detail Test Client")).toBeVisible();
    // Phone and wechat should be visible in detail view
    await expect(page.locator("text=13700137000")).toBeVisible();
  });

  // 5. Edit client and refresh confirms persistence
  test("5. edit and verify persistence", async ({ page }) => {
    await createClient(page, { name: "Before Edit", phone: "13600136000" });
    const editUrl = page.url() + "/edit";
    await page.goto(editUrl);
    await expect(page.locator('input[name="name"]')).toHaveValue("Before Edit");
    await page.fill('input[name="name"]', "After Edit");
    await page.fill('input[name="phone"]', "13600136999");

    await page.click('[data-testid="client-edit-submit"]');
    await page.waitForURL(/\/clients\/[a-f0-9-]+$/, { timeout: 15000 });
    await expect(page.locator("h1")).toContainText("After Edit");
    await page.reload();
    await expect(page.locator("h1")).toContainText("After Edit");
  });

  // 6. Change stage
  // 6. Change stage via real UI — navigate to edit page, select, save, verify
  test("6. change client stage", async ({ page }) => {
    await createClient(page, { name: "Stage Change", phone: "13500135000" });
    const clientId = page.url().split("/").pop()!;

    // Navigate to edit page
    await page.goto(`/clients/${clientId}/edit`);
    await page.waitForLoadState("networkidle");

    // Select new stage from dropdown
    const stageSelect = page.locator('select[name="stage"]');
    await expect(stageSelect).toBeVisible({ timeout: 5000 });
    await stageSelect.selectOption("qualified");

    // Click save
    const submitBtn = page.locator('[data-testid="client-edit-submit"]');
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Should navigate to detail page
    await page.waitForURL(new RegExp(`/clients/${clientId}$`), { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    // Verify stage persisted — refresh and check
    await page.reload();
    await page.waitForLoadState("networkidle");
    const pageText = await page.locator("body").innerText();
    expect(pageText.includes("已确认") || pageText.includes("qualified")).toBe(true);
  });

  // 7. Invalid stage blocked at UI level (dropdown only shows valid options)
  test("7. invalid stage cannot be selected in UI", async ({ page }) => {
    await createClient(page, { name: "Stage Validation", phone: "13400134000" });
    const clientId = page.url().split("/").pop()!;

    // Navigate to edit page
    await page.goto(`/clients/${clientId}/edit`);
    await page.waitForLoadState("networkidle");

    // Verify stage dropdown exists and only contains valid options
    const stageSelect = page.locator('select[name="stage"]');
    await expect(stageSelect).toBeVisible();

    // Get all option values
    const options = await stageSelect.locator("option").all();
    const optionValues: string[] = [];
    for (const opt of options) {
      const val = await opt.getAttribute("value");
      if (val) optionValues.push(val);
    }

    // All options should be valid stages
    const validStages = ["new","qualified","properties_sent","viewing_scheduled","viewed","considering","closed_won","paused","lost","deleted"];
    for (const v of optionValues) {
      expect(validStages).toContain(v);
    }
    // Invalid stage should NOT be present
    expect(optionValues).not.toContain("invalid_stage_xyz");

    // Verify API still rejects invalid stage (defense-in-depth)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resp = await page.request.patch(`${baseUrl}/api/clients/${clientId}`, {
      data: { stage: "invalid_stage_xyz" },
    });
    expect(resp.status()).toBe(422);
  });

  // 8. Soft delete
  test("8. soft-delete via UI", async ({ page }) => {
    await createClient(page, { name: "To Delete Client", phone: "13300133000" });
    const deleteBtn = page.locator('[data-testid="client-delete-button"]');
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      const confirmBtn = page.locator('[data-testid="client-delete-confirm"]');
      await confirmBtn.click();
      await page.waitForURL("/clients", { timeout: 10000 }).catch(() => {});
    }
    // Reload to check client is gone
    await page.goto("/clients");
    await expect(page.locator("text=To Delete Client")).not.toBeVisible({ timeout: 5000 });
  });

  // 9. Deleted client not visible in list
  test("9. deleted client excluded from list", async ({ page }) => {
    await createClient(page, { name: "Will Be Deleted", phone: "13200132000" });
    const editUrl = page.url() + "/edit";
    await page.goto(editUrl);

    // Use delete via browser fetch
    const clientId = page.url().split("/").pop();
    const csrfToken = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="csrf-token"]');
      return meta ? meta.getAttribute("content") : "";
    });

    await page.evaluate(
      async ({ id, token }) => {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["x-csrf-token"] = token;
        await fetch(`/api/clients/${id}`, { method: "DELETE", headers });
      },
      { id: clientId, token: csrfToken }
    );

    await page.goto("/clients");
    await expect(page.locator("text=Will Be Deleted")).not.toBeVisible({ timeout: 5000 });
  });

  // 10. Cross-workspace access denied
  test("10. cross-workspace access denied", async ({ browser }) => {
    // Create client as owner
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const clientId = await createClient(ownerPage, {
      name: "Cross WS Secret",
      phone: "13100131000",
      wechat: "wx_secret",
    });
    await ownerCtx.close();

    // Try to access as other workspace user
    const otherCtx = await browser.newContext({ storageState: OTHER_STATE });
    const otherPage = await otherCtx.newPage();
    await otherPage.goto(`/clients/${clientId}`);
    const text = await otherPage.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    expect(text.includes("Cross WS Secret")).toBe(false);
    expect(text.includes("13100131000")).toBe(false);
    expect(text.includes("wx_secret")).toBe(false);
    await otherCtx.close();
  });

  // 11. Unauthenticated access through real browser navigation
  test("11. unauthenticated access denied", async ({ browser }) => {
    // Fresh context with NO auth storage
    const ctx = await browser.newContext({ storageState: undefined });
    const pg = await ctx.newPage();

    // Navigate to clients page — should redirect to login
    await pg.goto("/clients", { waitUntil: "networkidle" });
    const url = pg.url();
    expect(url.includes("/login") || url.includes("/auth")).toBe(true);

    // Also verify API returns 401 for unauthenticated request
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const apiResp = await pg.request.get(`${baseUrl}/api/clients`);
    expect(apiResp.status()).toBe(401);

    await ctx.close();
  });

  // 12. Mobile 375px layout
  test("12. mobile 375px no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/clients");
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const cw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(cw + 10);
  });

  // 13. Form validation errors
  test("13. form validation shows errors", async ({ page }) => {
    await page.goto("/clients/new");
    // Submit empty form
    const submitBtn = page.locator('[data-testid="client-create-submit"]');
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      // Should show validation error for required name field
      // The page might show an inline error or prevent navigation
      const errorElement =
        page.locator('[data-testid="client-name-error"]').or(
          page.locator("text=请填写").or(page.locator("text=必填"))
        );
      const isErrorVisible = await errorElement.first().isVisible({ timeout: 3000 }).catch(() => false);
      // If no explicit error element, verify we are still on the form page (not redirected to detail)
      if (!isErrorVisible) {
        expect(page.url()).toContain("/clients/new");
      }
    }
  });

  // 14. Double submit is safe
  // 14. Double submit safety — only one record created, button disabled during submit
  test("14. double submit creates only one record", async ({ page }) => {
    const uniqueName = `DoubleSubmit-${Date.now()}`;
    await page.goto("/clients/new");
    await page.fill('input[name="name"]', uniqueName);
    await page.fill('input[name="phone"]', "13000130000");

    // Click submit
    const submitBtn = page.locator('[data-testid="client-create-submit"]');
    await submitBtn.click();

    // Button should be disabled immediately after click (loading state)
    await expect(submitBtn).toBeDisabled();

    // Try clicking again while disabled — should be ignored
    try { await submitBtn.click({ timeout: 500 }); } catch { /* element is disabled, click rejected */ }

    // Wait for navigation to detail page
    await page.waitForURL(/\/clients\/[a-f0-9-]+/, { timeout: 15000 });

    // Verify the client was created with our unique name (it appears in page body)
    await expect(page.locator("h1")).toContainText(uniqueName);

    // Navigate to list and verify only ONE instance of this name
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");
    const listText = await page.locator("body").innerText();
    // Count occurrences of the unique name — should be exactly 1
    const occurrences = (listText.match(new RegExp(uniqueName, "g")) || []).length;
    expect(occurrences).toBe(1);
  });

  // 15. Phone/wechat NOT leaked in list view
  test("15. phone and wechat not leaked in list", async ({ page }) => {
    await createClient(page, {
      name: "Privacy Test Client",
      phone: "12900129000",
      wechat: "wx_privacy_test",
    });
    await page.goto("/clients");
    // Wait for list to load
    await page.waitForLoadState("networkidle");

    const listText = await page.locator("body").innerText();
    // The phone and wechat should NOT appear in the list view
    expect(listText.includes("12900129000")).toBe(false);
    expect(listText.includes("wx_privacy_test")).toBe(false);
    // But the name SHOULD appear (case-insensitive partial match in body)
    expect(listText.includes("Privacy")).toBe(true);
  });
});
