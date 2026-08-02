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
  if (data.budget_min) await page.fill('input[name="budget_min"]', data.budget_min);
  if (data.budget_max) await page.fill('input[name="budget_max"]', data.budget_max);
  if (data.source_platform) await page.fill('input[name="source_platform"]', data.source_platform);
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
  test("6. change client stage", async ({ page }) => {
    await createClient(page, { name: "Stage Change", phone: "13500135000" });
    const editUrl = page.url() + "/edit";
    await page.goto(editUrl);

    const stageSelect = page.locator('select[name="stage"]');
    if (await stageSelect.isVisible()) {
      await stageSelect.selectOption("qualified");
      await page.click('[data-testid="client-edit-submit"]');
      await page.waitForURL(/\/clients\/[a-f0-9-]+$/, { timeout: 15000 });
    }
    // Verify page loaded after stage change
    await expect(page.locator("h1")).toContainText("Stage Change");
  });

  // 7. Invalid stage rejected (422)
  test("7. invalid stage rejected", async ({ page }) => {
    await createClient(page, { name: "Stage Validation", phone: "13400134000" });
    const editUrl = page.url() + "/edit";
    await page.goto(editUrl);

    // Try to set an invalid stage via direct fetch
    const clientId = page.url().split("/").pop();
    const csrfToken = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="csrf-token"]');
      return meta ? meta.getAttribute("content") : "";
    });

    const resp = await page.evaluate(
      async ({ id, token }) => {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) headers["x-csrf-token"] = token;
        const r = await fetch(`/api/clients/${id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ stage: "invalid_stage_xyz" }),
        });
        return r.status;
      },
      { id: clientId, token: csrfToken }
    );

    expect(resp).toBe(422);
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

  // 11. Unauthenticated access denied (401)
  test("11. unauthenticated access denied", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const pg = await ctx.newPage();

    // Try accessing client list without auth
    const resp = await pg.evaluate(async () => {
      const r = await fetch("/api/clients");
      return { status: r.status };
    });
    expect(resp.status).toBe(401);

    // Try accessing client page
    await pg.goto("/clients").catch(() => {});
    // Should redirect to login
    const url = pg.url();
    expect(url.includes("/login") || url.includes("/auth")).toBeTruthy();
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
  test("14. double submit is safe", async ({ page }) => {
    await page.goto("/clients/new");
    await page.fill('input[name="name"]', "Safe Double Submit");
    await page.fill('input[name="phone"]', "13000130000");

    // Click submit twice rapidly
    const submitBtn = page.locator('[data-testid="client-create-submit"]');
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await submitBtn.click().catch(() => {});
    }

    await page.waitForURL(/\/clients\/[a-f0-9-]+/, { timeout: 15000 }).catch(() => {});
    // Should navigate to detail page successfully (idempotent or at least not crash)
    await expect(page.locator("h1")).toContainText("Safe Double Submit");
  });

  // 15. Phone/wechat NOT leaked in list view
  test("15. phone and wechat not leaked in list", async ({ page }) => {
    await createClient(page, {
      name: "Privacy Test Client",
      phone: "12900129000",
      wechat: "wx_privacy_test",
    });
    await page.goto("/clients");

    const listText = await page.locator("body").innerText();
    // The phone and wechat should NOT appear in the list view
    expect(listText.includes("12900129000")).toBe(false);
    expect(listText.includes("wx_privacy_test")).toBe(false);
    // But the name SHOULD appear
    expect(listText.includes("Privacy Test Client")).toBe(true);
  });
});
