/**
 * Phase 1-A Bootstrap E2E Smoke Tests
 *
 * Verifies that the core pages load without client-side errors and that
 * responsive layout elements appear at mobile and desktop viewports.
 *
 * These tests do NOT call real Supabase, DeepSeek, or STT services.
 */

import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("loads successfully at /", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const response = await page.goto("/");

    // HTTP-level success
    expect(response?.status()).toBe(200);

    // Content renders
    await expect(
      page.locator("text=阳光智家 HouseVibe")
    ).toBeVisible({ timeout: 10000 });

    // No uncaught client-side errors
    expect(errors).toEqual([]);
  });
});

test.describe("Dashboard", () => {
  test("loads successfully at /dashboard", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const response = await page.goto("/dashboard");

    expect(response?.status()).toBe(200);

    await expect(page.locator("text=工作台")).toBeVisible({ timeout: 10000 });

    expect(errors).toEqual([]);
  });
});

test.describe("Responsive layout", () => {
  test("homepage content is visible at mobile viewport (375px)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    // The main heading should be visible
    await expect(
      page.locator("text=阳光智家 HouseVibe")
    ).toBeVisible({ timeout: 10000 });

    // The page should not have horizontal overflow at mobile width
    const bodyWidth = await page.evaluate(
      () => document.body.scrollWidth
    );
    expect(bodyWidth).toBeLessThanOrEqual(375);
  });

  test("homepage content is visible at desktop viewport (1280px)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(
      page.locator("text=阳光智家 HouseVibe")
    ).toBeVisible({ timeout: 10000 });
  });

  test("dashboard content is visible at mobile viewport (375px)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const response = await page.goto("/dashboard");
    expect(response?.status()).toBe(200);

    await expect(page.locator("text=工作台")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Console cleanliness", () => {
  test("homepage produces no uncaught console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Filter out known non-critical CSS/asset warnings that are not real errors
    const realErrors = errors.filter(
      (e) =>
        !e.includes("Failed to load resource") &&
        !e.includes("404") &&
        !e.includes("favicon")
    );

    expect(realErrors).toEqual([]);
  });

  test("dashboard produces no uncaught console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const realErrors = errors.filter(
      (e) =>
        !e.includes("Failed to load resource") &&
        !e.includes("404") &&
        !e.includes("favicon")
    );

    expect(realErrors).toEqual([]);
  });
});
