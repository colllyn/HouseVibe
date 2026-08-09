/**
 * Client AI Text Autofill E2E Tests
 *
 * Covers: complete flow with mock AI, missing required name,
 * partial extraction, boolean edit in confirmation card,
 * 429 quota error, provider error safety, double-click prevention,
 * 375px mobile layout.
 *
 * All AI requests use page.route() mock — no real DeepSeek calls.
 */

import { test, expect } from "@playwright/test";

// ============================================================
// Helpers
// ============================================================

const EXTRACT_URL = "**/api/ai/extract-client";

/** Mock a successful AI extraction response */
function mockExtractSuccess(
  page: import("@playwright/test").Page,
  overrides?: Record<string, unknown>
) {
  return page.route(EXTRACT_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          extraction: {
            data: {
              name: "张先生",
              budgetMin: 5000,
              budgetMax: 8000,
              preferredDistricts: ["南山科技园", "后海"],
              bedrooms: 2,
              rentalType: "whole_unit",
              availableFrom: "2026-09-01",
              petsRequired: true,
              cookingRequired: false,
              commuteDestination: "国贸大厦",
              minimumLeaseMonths: 12,
              ...overrides,
            },
            missingFields: [] as string[],
            uncertainFields: [] as Array<{ field: string; reason: string }>,
            rawText: "张先生，南山科技园两房，预算8000",
          },
        },
        error: null,
      }),
    });
  });
}

/** Mock AI extraction that returns no name (missing required field) */
function mockExtractNoName(page: import("@playwright/test").Page) {
  return page.route(EXTRACT_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          extraction: {
            data: {
              budgetMin: 5000,
              budgetMax: 8000,
              preferredDistricts: ["南山"],
              bedrooms: 2,
              availableFrom: "2026-09-01",
            },
            missingFields: ["name"],
            uncertainFields: [],
            rawText: "南山两房，预算8000，下个月入住",
          },
        },
        error: null,
      }),
    });
  });
}

/** Mock AI extraction with partial fields only */
function mockExtractPartial(page: import("@playwright/test").Page) {
  return page.route(EXTRACT_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          extraction: {
            data: {
              bedrooms: 2,
              budgetMax: 8000,
              preferredDistricts: ["福田"],
            },
            missingFields: [
              "name",
              "budgetMin",
              "preferredCommunities",
              "rentalType",
              "availableFrom",
              "minimumLeaseMonths",
              "petsRequired",
              "cookingRequired",
              "commuteDestination",
            ],
            uncertainFields: [{ field: "budgetMax", reason: "未明确上限" }],
            rawText: "福田两房，预算8000以内",
          },
        },
        error: null,
      }),
    });
  });
}

/** Mock AI extraction returning 429 quota exceeded */
function mockExtractQuotaExceeded(page: import("@playwright/test").Page) {
  return page.route(EXTRACT_URL, async (route) => {
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        data: null,
        error: { code: "QUOTA_EXCEEDED", message: "quota exceeded" },
      }),
    });
  });
}

/** Mock AI extraction returning provider error */
function mockExtractProviderError(page: import("@playwright/test").Page) {
  return page.route(EXTRACT_URL, async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        data: null,
        error: {
          code: "AI_UPSTREAM_ERROR",
          message: "DeepSeek API returned 500",
          upstreamStatus: 500,
          requestId: "req-internal-123",
        },
      }),
    });
  });
}

// ============================================================
// Tests
// ============================================================

test.describe("Client AI Text Autofill", () => {
  // ----------------------------------------------------------
  // Case 1: Complete flow — AI extraction → auto-fill → modify → create
  // ----------------------------------------------------------
  test("1. complete flow: AI extraction → auto-fill → modify → create → verify", async ({
    page,
  }) => {
    await mockExtractSuccess(page);

    await page.goto("/clients/new");
    await page.waitForLoadState("networkidle");

    // Type client description
    const textarea = page.locator('textarea').first();
    await textarea.fill(
      "张先生，想在南山科技园或后海租两房，预算每月8000以内，下个月入住，希望有电梯、靠近地铁"
    );

    // Click AI extract
    await page.click('[data-testid="client-ai-extract-btn"]');

    // Wait for confirmation card to appear
    await expect(page.locator("text=AI 识别结果检查")).toBeVisible({
      timeout: 10000,
    });

    // Verify confirmation card shows "识别结果已填入" (auto-filled mode)
    await expect(page.locator("text=识别结果已填入")).toBeVisible({
      timeout: 5000,
    });

    // Verify form fields were auto-filled immediately (no second "confirm" button needed)
    const budgetMaxInput = page.locator('input[name="budget_max"]');
    // Budget section is collapsible — expand it first
    const budgetToggle = page.locator('button:has-text("预算与阶段信息")');
    if (await budgetToggle.isVisible()) {
      await budgetToggle.click();
    }
    // The budget_max should be auto-filled with 8000
    const budgetVal = await budgetMaxInput.inputValue();
    expect(budgetVal).toBe("8000");

    // Modify budget in confirmation card: find and edit the "预算上限" field
    const budgetCardEdit = page
      .locator(".rounded-lg.border")
      .filter({ hasText: "预算上限" })
      .locator('button[aria-label*="编辑"]')
      .first();
    if (await budgetCardEdit.isVisible()) {
      await budgetCardEdit.click();
      // Type new value
      const editInput = page.locator('input[type="text"]').first();
      await editInput.fill("7500");
      // Save
      await page.locator('button:has(svg.lucide-check)').first().click();
    }

    // Verify form synced: budget_max should now be 7500
    const updatedBudget = await budgetMaxInput.inputValue();
    expect(updatedBudget).toBe("7500");

    // Fill in name if needed (it should be auto-filled from AI)
    const nameInput = page.locator('input[name="name"]');
    const nameVal = await nameInput.inputValue();
    if (!nameVal) {
      await nameInput.fill("张先生");
    }

    // Click create
    await page.click('[data-testid="client-create-submit"]');

    // Wait for redirect to client detail
    await page.waitForURL(/\/clients\/[a-f0-9-]+/, { timeout: 15000 });

    // Verify final client detail shows the modified value (7500, not 8000)
    await expect(page.locator("h1")).toContainText("张先生");

    // The detail page should contain the modified budget value somewhere
    const pageText = await page.locator("body").innerText();
    // Budget 7500 should be present (modified), 8000 should NOT (original AI value was overridden)
    expect(pageText.includes("7500")).toBe(true);
  });

  // ----------------------------------------------------------
  // Case 2: Missing required name — form validation blocks creation
  // ----------------------------------------------------------
  test("2. missing required name: AI no-name → show error → user fills → create", async ({
    page,
  }) => {
    await mockExtractNoName(page);

    await page.goto("/clients/new");
    await page.waitForLoadState("networkidle");

    // Type description WITHOUT name
    const textarea = page.locator('textarea').first();
    await textarea.fill("南山两房，预算8000，下个月入住");

    // Click AI extract
    await page.click('[data-testid="client-ai-extract-btn"]');

    // Wait for confirmation card
    await expect(page.locator("text=AI 识别结果检查")).toBeVisible({
      timeout: 10000,
    });

    // Other fields should be auto-filled (e.g., bedrooms, budget)
    const bedroomsInput = page.locator('input[name="bedrooms"]');
    const bedroomsVal = await bedroomsInput.inputValue();
    expect(bedroomsVal).toBe("2");

    // Expand budget section
    const budgetToggle = page.locator('button:has-text("预算与阶段信息")');
    if (await budgetToggle.isVisible()) {
      await budgetToggle.click();
    }

    // name field should be empty
    const nameInput = page.locator('input[name="name"]');
    const nameVal = await nameInput.inputValue();
    expect(nameVal).toBe("");

    // Try creating — should be blocked with validation error
    await page.click('[data-testid="client-create-submit"]');

    // Should see required field error for name — AI-specific message
    await expect(
      page.locator("text=AI未识别到客户姓名，请补充")
    ).toBeVisible({ timeout: 5000 });

    // Fill in name manually
    await nameInput.fill("李先生");

    // Now create should succeed
    await page.click('[data-testid="client-create-submit"]');
    await page.waitForURL(/\/clients\/[a-f0-9-]+/, { timeout: 15000 });
    await expect(page.locator("h1")).toContainText("李先生");
  });

  // ----------------------------------------------------------
  // Case 3: Partial extraction — AI returns only some fields
  // ----------------------------------------------------------
  test("3. partial extraction: only fills extracted fields, others stay empty", async ({
    page,
  }) => {
    await mockExtractPartial(page);

    await page.goto("/clients/new");
    await page.waitForLoadState("networkidle");

    const textarea = page.locator('textarea').first();
    await textarea.fill("福田两房，预算8000以内");

    await page.click('[data-testid="client-ai-extract-btn"]');

    await expect(page.locator("text=AI 识别结果检查")).toBeVisible({
      timeout: 10000,
    });

    // bedrooms should be filled
    const bedroomsInput = page.locator('input[name="bedrooms"]');
    expect(await bedroomsInput.inputValue()).toBe("2");

    // preferred_districts should be filled
    const districtsInput = page.locator('input[name="preferred_districts"]');
    expect(await districtsInput.inputValue()).toBe("福田");

    // name should NOT be filled (AI didn't extract it)
    const nameInput = page.locator('input[name="name"]');
    expect(await nameInput.inputValue()).toBe("");

    // rental_type should NOT be filled
    const rentalSelect = page.locator('select[name="rental_type"]');
    expect(await rentalSelect.inputValue()).toBe("");
  });

  // ----------------------------------------------------------
  // Case 4: Boolean edit in confirmation card preserves type
  // ----------------------------------------------------------
  test("4. boolean edit: toggle pets_required in card → form checkbox syncs", async ({
    page,
  }) => {
    await mockExtractSuccess(page, { petsRequired: true });

    await page.goto("/clients/new");
    await page.waitForLoadState("networkidle");

    const textarea = page.locator('textarea').first();
    await textarea.fill("需要养宠物，南山两房");

    await page.click('[data-testid="client-ai-extract-btn"]');

    await expect(page.locator("text=AI 识别结果检查")).toBeVisible({
      timeout: 10000,
    });

    // pets_required checkbox should be checked (AI returned true)
    const petsCheckbox = page.locator('input[name="pets_required"]');
    await expect(petsCheckbox).toBeChecked();

    // Edit the "需要养宠物" field in confirmation card to "否"
    const petsCardEdit = page
      .locator(".rounded-lg.border")
      .filter({ hasText: "需要养宠物" })
      .locator('button[aria-label*="编辑"]')
      .first();

    if (await petsCardEdit.isVisible()) {
      await petsCardEdit.click();
      const editInput = page.locator('input[type="text"]').first();
      await editInput.fill("否");
      await page.locator('button:has(svg.lucide-check)').first().click();
    }

    // Checkbox should now be unchecked (confirmation card edit synced to form)
    await expect(petsCheckbox).not.toBeChecked();

    // Fill required name
    const nameInput = page.locator('input[name="name"]');
    if (!(await nameInput.inputValue())) {
      await nameInput.fill("宠物测试客户");
    }

    // Create and verify
    await page.click('[data-testid="client-create-submit"]');
    await page.waitForURL(/\/clients\/[a-f0-9-]+/, { timeout: 15000 });
    await expect(page.locator("h1")).toContainText("宠物测试客户");
  });

  // ----------------------------------------------------------
  // Case 5: 429 Quota exceeded — shows user-friendly message
  // ----------------------------------------------------------
  test("5. 429 quota: shows correct quota limit message", async ({ page }) => {
    await mockExtractQuotaExceeded(page);

    await page.goto("/clients/new");
    await page.waitForLoadState("networkidle");

    const textarea = page.locator('textarea').first();
    await textarea.fill("南山两房，预算8000");

    await page.click('[data-testid="client-ai-extract-btn"]');

    // Should show quota error message (NOT raw error)
    await expect(
      page.locator("text=AI 使用额度已达到限制，请稍后再试")
    ).toBeVisible({ timeout: 10000 });

    // Should NOT expose internal error codes
    const pageText = await page.locator("body").innerText();
    expect(pageText.includes("QUOTA_EXCEEDED")).toBe(false);
    expect(pageText.includes("quota exceeded")).toBe(false);

    // Button should be re-enabled for manual entry
    const extractBtn = page.locator('[data-testid="client-ai-extract-btn"]');
    await expect(extractBtn).toBeEnabled();

    // Form should still be usable (no lockout)
    const nameInput = page.locator('input[name="name"]');
    await nameInput.fill("手动输入客户");
    const nameVal = await nameInput.inputValue();
    expect(nameVal).toBe("手动输入客户");

    // Confirmation card should NOT appear
    await expect(page.locator("text=AI 识别结果检查")).not.toBeVisible();
  });

  // ----------------------------------------------------------
  // Case 6: Provider error — safe error, no internal details leaked
  // ----------------------------------------------------------
  test("6. provider error: has safe error message, no internal details", async ({
    page,
  }) => {
    await mockExtractProviderError(page);

    await page.goto("/clients/new");
    await page.waitForLoadState("networkidle");

    const textarea = page.locator('textarea').first();
    await textarea.fill("南山两房，预算8000");

    await page.click('[data-testid="client-ai-extract-btn"]');

    // Should show safe error message (NOT internal details)
    await expect(
      page.locator("text=AI 服务暂时不可用")
    ).toBeVisible({ timeout: 10000 });

    // Should NOT leak internal details
    const pageText = await page.locator("body").innerText();
    expect(pageText.includes("upstreamStatus")).toBe(false);
    expect(pageText.includes("req-internal")).toBe(false);
    expect(pageText.includes("DeepSeek")).toBe(false);

    // Button should be re-enabled after error
    const extractBtn = page.locator('[data-testid="client-ai-extract-btn"]');
    await expect(extractBtn).toBeEnabled();

    // Form should still be usable
    const nameInput = page.locator('input[name="name"]');
    await nameInput.fill("手动输入");
    expect(await nameInput.inputValue()).toBe("手动输入");

    // Confirmation card should NOT appear
    await expect(page.locator("text=AI 识别结果检查")).not.toBeVisible();
  });

  // ----------------------------------------------------------
  // Case 6b: Network/connection failure — safe error, form remains usable
  // ----------------------------------------------------------
  test("6b. connection failure: safe error message, button re-enabled, form usable", async ({
    page,
  }) => {
    await page.route(EXTRACT_URL, async (route) => {
      await route.abort("connectionrefused");
    });

    await page.goto("/clients/new");
    await page.waitForLoadState("networkidle");

    const textarea = page.locator('textarea').first();
    await textarea.fill("南山两房，预算8000");

    await page.click('[data-testid="client-ai-extract-btn"]');

    // Should show safe error message
    await expect(
      page.locator("text=AI 识别失败，请检查网络后重试")
    ).toBeVisible({ timeout: 10000 });

    // Button should be re-enabled
    const extractBtn = page.locator('[data-testid="client-ai-extract-btn"]');
    await expect(extractBtn).toBeEnabled();

    // Form should still be usable
    const nameInput = page.locator('input[name="name"]');
    await nameInput.fill("网络故障后手动输入");
    expect(await nameInput.inputValue()).toBe("网络故障后手动输入");

    // Confirmation card should NOT appear
    await expect(page.locator("text=AI 识别结果检查")).not.toBeVisible();
  });

  // ----------------------------------------------------------
  // Case 7: Double-click prevention on AI extract button
  // ----------------------------------------------------------
  test("7. double-click prevention: only 1 request sent", async ({ page }) => {
    let requestCount = 0;

    await page.route(EXTRACT_URL, async (route) => {
      requestCount++;
      // Small delay to simulate real processing
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            extraction: {
              data: {
                name: "快速点击测试",
                bedrooms: 2,
                budgetMax: 8000,
              },
              missingFields: [],
              uncertainFields: [],
              rawText: "南山两房",
            },
          },
          error: null,
        }),
      });
    });

    await page.goto("/clients/new");
    await page.waitForLoadState("networkidle");

    const textarea = page.locator('textarea').first();
    await textarea.fill("南山两房，预算8000");

    const extractBtn = page.locator('[data-testid="client-ai-extract-btn"]');

    // Click twice rapidly — second click should be blocked by disabled state
    await extractBtn.click();
    // Use dispatchEvent to bypass Playwright actionability check for double-click test.
    // The button's disabled state is the correct behavior; we want to verify
    // that even if a click gets through, only 1 request is sent.
    await extractBtn.evaluate((el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    // Wait for confirmation card
    await expect(page.locator("text=AI 识别结果检查")).toBeVisible({
      timeout: 15000,
    });

    // Only 1 request should have been sent
    expect(requestCount).toBe(1);
  });

  // ----------------------------------------------------------
  // Case 8: 375px mobile layout — all elements accessible
  // ----------------------------------------------------------
  test("8. mobile 375px: all elements accessible, no horizontal scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await mockExtractSuccess(page);

    await page.goto("/clients/new");
    await page.waitForLoadState("networkidle");

    // Verify no horizontal scroll
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const cw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(cw + 10);

    // Textarea accessible
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();

    // Type text
    await textarea.fill("南山两房，预算8000");

    // AI button accessible (44px touch target)
    const extractBtn = page.locator('[data-testid="client-ai-extract-btn"]');
    await expect(extractBtn).toBeVisible();
    const btnBox = await extractBtn.boundingBox();
    expect(btnBox).not.toBeNull();
    expect(btnBox!.height).toBeGreaterThanOrEqual(44);

    // Click extract
    await extractBtn.click();

    // Confirmation card visible at 375px
    await expect(page.locator("text=AI 识别结果检查")).toBeVisible({
      timeout: 10000,
    });

    // Form inputs accessible
    const nameInput = page.locator('input[name="name"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill("移动端测试");

    // Create button accessible
    const submitBtn = page.locator('[data-testid="client-create-submit"]');
    await expect(submitBtn).toBeVisible();

    // Verify no horizontal scroll after all interactions
    const sw2 = await page.evaluate(() => document.documentElement.scrollWidth);
    const cw2 = await page.evaluate(() => document.documentElement.clientWidth);
    expect(sw2).toBeLessThanOrEqual(cw2 + 10);
  });
});
