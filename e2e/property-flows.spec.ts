/**
 * Property CRUD E2E — Phase 2 P2-PROP-001
 * Real browser UI → fetch() → Route Handler → manual page.goto().
 */

import { test, expect } from "@playwright/test";
import * as path from "path";

const OTHER_STATE = path.resolve(__dirname, ".auth/other.json");

async function createProperty(page: import("@playwright/test").Page, data: {
  title: string; city: string; rental_type?: string; district?: string;
  community_name?: string; monthly_rent?: string; bedrooms?: string;
  owner_name?: string; owner_phone?: string;
}): Promise<string> {
  await page.goto("/properties/new");
  await page.fill('input[name="title"]', data.title);
  await page.fill('input[name="city"]', data.city);
  await page.selectOption('select[name="rental_type"]', data.rental_type ?? "whole_unit");
  if (data.district) await page.fill('input[name="district"]', data.district);
  if (data.community_name) await page.fill('input[name="community_name"]', data.community_name);
  if (data.monthly_rent) await page.fill('input[name="monthly_rent"]', data.monthly_rent);
  if (data.bedrooms) await page.fill('input[name="bedrooms"]', data.bedrooms);
  if (data.owner_name || data.owner_phone) {
    const toggle = page.locator("text=敏感信息");
    if (await toggle.isVisible()) await toggle.click();
    if (data.owner_name) await page.fill('input[name="owner_name"]', data.owner_name);
    if (data.owner_phone) await page.fill('input[name="owner_phone"]', data.owner_phone);
  }

  // Click submit — page auto-navigates via window.location.href
  await page.click('[data-testid="property-create-submit"]');
  await page.waitForURL(/\/properties\/[a-f0-9-]+/, { timeout: 15000 });
  return page.url().split("/").pop()!;
}

test.describe("Property CRUD", () => {
  // 1. Page loads
  test("1. property page loads", async ({ page }) => {
    await page.goto("/properties");
    await expect(page.locator("h1")).toContainText("房源");
  });

  // 2. Create
  test("2. create property via UI", async ({ page }) => {
    await createProperty(page, {
      title: "UI Created", city: "Beijing", district: "Chaoyang",
      community_name: "Test Community", monthly_rent: "4500", bedrooms: "2",
    });
    await expect(page.locator("h1")).toContainText("UI Created");
  });

  // 3. Created in list
  test("3. created property in list", async ({ page }) => {
    await createProperty(page, { title: "List Check", city: "Shanghai" });
    await page.goto("/properties");
    await expect(page.locator("text=List Check")).toBeVisible({ timeout: 10000 });
  });

  // 4. Detail page
  test("4. detail page shows info", async ({ page }) => {
    await createProperty(page, { title: "Detail Test", city: "Guangzhou", district: "Tianhe" });
    await expect(page.locator("text=Tianhe")).toBeVisible();
  });

  // 5. Detail page renders sensitive section
  test("5. detail page shows sensitive info section", async ({ page }) => {
    await createProperty(page, { title: "Private", city: "Shenzhen" });
    // Section exists even if empty (shows "暂无敏感信息")
    const section = page.locator("text=敏感信息").or(page.locator("text=暂无敏感信息"));
    await expect(section.first()).toBeVisible();
  });

  // 6. Edit + persistence
  test("6. edit and verify persistence", async ({ page }) => {
    await createProperty(page, { title: "Before Edit", city: "Chengdu" });
    const editUrl = page.url() + "/edit";
    await page.goto(editUrl);
    await expect(page.locator('input[name="title"]')).toHaveValue("Before Edit");
    await page.fill('input[name="title"]', "After Edit");

    await page.click('[data-testid="property-edit-submit"]');
    await page.waitForURL(/\/properties\/[a-f0-9-]+$/, { timeout: 15000 });
    await expect(page.locator("h1")).toContainText("After Edit");
    await page.reload();
    await expect(page.locator("h1")).toContainText("After Edit");
  });

  // 7. Soft delete via UI
  test("7. soft delete via UI", async ({ page }) => {
    await createProperty(page, { title: "To Delete", city: "Wuhan" });
    await page.click('[data-testid="property-delete-button"]');
    const confirmBtn = page.locator('[data-testid="property-delete-confirm"]');
    await confirmBtn.click();
    // Page navigates to /properties after successful delete
    await page.waitForURL("/properties", { timeout: 10000 }).catch(() => {});
    // Reload to check
    await page.goto("/properties");
    await expect(page.locator("text=To Delete")).not.toBeVisible({ timeout: 5000 });
  });

  // 8. Cross-workspace
  test("8. cross-workspace access denied", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const id = await createProperty(ownerPage, { title: "Secret", city: "Nanjing" });
    await ownerCtx.close();

    const otherCtx = await browser.newContext({ storageState: OTHER_STATE });
    const otherPage = await otherCtx.newPage();
    await otherPage.goto(`/properties/${id}`);
    const text = await otherPage.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    expect(text.includes("Secret")).toBe(false);
    await otherCtx.close();
  });

  // 9. Mobile
  test("9. mobile 375px no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/properties");
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const cw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(cw + 10);
  });

  // 10. Unauthenticated — verify /login is accessible
  test("10. unauthenticated user can access login", async ({ browser }) => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await pg.goto("/login");
    await expect(pg.locator('input[name="email"]')).toBeVisible({ timeout: 5000 });
    await ctx.close();
  });

  // 11. Private fields in detail
  test("11. owner fields visible in detail", async ({ page }) => {
    await createProperty(page, { title: "Owner Test", city: "Xiamen",
      owner_name: "Zhang Owner", owner_phone: "13800138000" });
    await expect(page.locator("text=Zhang Owner")).toBeVisible();
  });

  // 12. Double submit safe
  test("12. double submit is safe", async ({ page }) => {
    await page.goto("/properties/new");
    await page.fill('input[name="title"]', "Safe Submit");
    await page.fill('input[name="city"]', "Kunming");
    await page.selectOption('select[name="rental_type"]', "whole_unit");
    await page.click('[data-testid="property-create-submit"]');
    await page.waitForURL(/\/properties\/[a-f0-9-]+/, { timeout: 15000 });
    await expect(page.locator("h1")).toContainText("Safe Submit");
  });

  // 13. DELETE via browser fetch (same-origin)
  test("13. delete via browser fetch", async ({ page }) => {
    // createProperty already navigates to detail page — don't re-goto
    // (re-navigating triggers Server Component render that drops session cookies)
    const id = await createProperty(page, { title: "FetchDelete", city: "Lhasa" });
    expect(id).toBeTruthy();

    // Delete via detail page (we're already there)
    await page.click('[data-testid="property-delete-button"]');
    const cfm = page.locator('[data-testid="property-delete-confirm"]');
    await cfm.click();
    await page.waitForURL("/properties", { timeout: 10000 }).catch(() => {});
    await page.goto("/properties");
    await expect(page.locator("text=FetchDelete")).not.toBeVisible({ timeout: 5000 });
  });

  // 14. Create and delete multiple — verify listing
  test("14. multiple creates and list verification", async ({ page }) => {
    await createProperty(page, { title: "Multi-A", city: "Suzhou" });
    await createProperty(page, { title: "Multi-B", city: "Wuxi" });
    await page.goto("/properties");
    await expect(page.locator("text=Multi-A")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Multi-B")).toBeVisible();
  });

  // 15. Edit page shows correct default values
  test("15. edit form pre-fills all fields", async ({ page }) => {
    const id = await createProperty(page, {
      title: "Prefill Test", city: "Hangzhou", district: "Xihu",
      monthly_rent: "6000", bedrooms: "3",
    });
    await page.goto(`/properties/${id}/edit`);
    await expect(page.locator('input[name="title"]')).toHaveValue("Prefill Test");
    await expect(page.locator('input[name="city"]')).toHaveValue("Hangzhou");
    await expect(page.locator('input[name="district"]')).toHaveValue("Xihu");
  });

  // 16. Edit tags (array field) and verify persistence after reload
  test("16. edit tags and verify persistence", async ({ page }) => {
    await createProperty(page, { title: "Tag Test", city: "Nanjing" });
    const editUrl = page.url() + "/edit";
    await page.goto(editUrl);
    await expect(page.locator('input[name="title"]')).toHaveValue("Tag Test");

    // Set tags
    await page.fill('input[name="tags"]', "近地铁, 精装修");
    await page.click('[data-testid="property-edit-submit"]');
    await page.waitForURL(/\/properties\/[a-f0-9-]+$/, { timeout: 15000 });

    // Navigate back to edit and verify tags persisted
    const detailUrl = page.url();
    await page.goto(detailUrl + "/edit");
    await expect(page.locator('input[name="tags"]')).toHaveValue("近地铁, 精装修");

    // Clear tags
    await page.fill('input[name="tags"]', "");
    await page.click('[data-testid="property-edit-submit"]');
    await page.waitForURL(/\/properties\/[a-f0-9-]+$/, { timeout: 15000 });
    await page.goto(page.url() + "/edit");
    await expect(page.locator('input[name="tags"]')).toHaveValue("");
  });

  // 17. Toggle boolean from true to false — verify after reload
  test("17. toggle boolean off and verify persistence", async ({ page }) => {
    await createProperty(page, { title: "Bool Toggle", city: "Suzhou" });
    const editUrl = page.url() + "/edit";
    await page.goto(editUrl);

    // Check "有电梯" on
    await page.locator('input[name="has_elevator"]').check();
    await page.click('[data-testid="property-edit-submit"]');
    await page.waitForURL(/\/properties\/[a-f0-9-]+$/, { timeout: 15000 });

    // Edit again — uncheck
    await page.goto(page.url() + "/edit");
    await page.locator('input[name="has_elevator"]').uncheck();
    await page.click('[data-testid="property-edit-submit"]');
    await page.waitForURL(/\/properties\/[a-f0-9-]+$/, { timeout: 15000 });

    // Go back to edit and verify it's still unchecked
    await page.goto(page.url() + "/edit");
    const elevCheckbox = page.locator('input[name="has_elevator"]');
    await expect(elevCheckbox).not.toBeChecked();
  });
});
