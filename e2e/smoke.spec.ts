/**
 * Phase 1-A Bootstrap E2E Smoke Tests
 *
 * Verifies that the core pages load without client-side errors and that
 * responsive layout elements appear at mobile and desktop viewports.
 *
 * These tests do NOT call real Supabase, DeepSeek, or STT services.
 */

import { test, expect } from "@playwright/test";

test.describe("Homepage (root redirect)", () => {
  test("unauthenticated / redirects to /login", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // Playwright follows redirects; unauthenticated → /login
    await page.goto("/", { waitUntil: "commit" });

    // Should land on /login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(new URL(page.url()).pathname).toBe("/login");

    // Login page content is visible
    await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({
      timeout: 10000,
    });

    expect(errors).toEqual([]);
  });
});

test.describe("Dashboard", () => {
  test("loads successfully at /dashboard (redirects to /login when unauthenticated)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const response = await page.goto("/dashboard");

    expect(response?.status()).toBe(200);

    // Unauthenticated users are redirected to /login
    await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({ timeout: 10000 });

    expect(errors).toEqual([]);
  });
});

test.describe("Responsive layout", () => {
  test("root / redirects to login at mobile viewport (375px)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto("/", { waitUntil: "commit" });
    await page.waitForURL(/\/login/, { timeout: 10000 });

    // Login heading should be visible at mobile width
    await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({
      timeout: 10000,
    });

    // The page should not have horizontal overflow at mobile width
    const bodyWidth = await page.evaluate(
      () => document.body.scrollWidth
    );
    expect(bodyWidth).toBeLessThanOrEqual(375);
  });

  test("root / redirects to login at desktop viewport (1280px)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto("/", { waitUntil: "commit" });
    await page.waitForURL(/\/login/, { timeout: 10000 });

    await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({
      timeout: 10000,
    });
  });

  test("dashboard redirects to login at mobile viewport (375px)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const response = await page.goto("/dashboard");
    expect(response?.status()).toBe(200);

    // Unauthenticated → redirect to /login
    await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Console cleanliness", () => {
  test("root / redirect produces no uncaught console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/", { waitUntil: "commit" });
    await page.waitForURL(/\/login/, { timeout: 10000 });
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
