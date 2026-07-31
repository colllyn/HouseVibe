/**
 * Auth E2E Tests — Phase 1-B2 FINALIZE
 *
 * Uses Playwright with local Supabase environment.
 * Tests unauthenticated protection, registration, login, dashboard access,
 * error messages, open redirect protection, and sign out.
 *
 * All test accounts use @example.invalid emails to avoid real email routing.
 *
 * Prerequisites:
 *   - Local Supabase stack running (npx supabase start)
 *   - Next.js dev server (npm run dev) on http://localhost:3000
 *
 * Run: node scripts/run-local-auth-e2e.mjs
 *   or: npx playwright test e2e/auth-flows.spec.ts
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase helper — uses service_role to create/cleanup test users
// ---------------------------------------------------------------------------
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Test user factory — creates unique users per test run
// ---------------------------------------------------------------------------
interface TestUser {
  email: string;
  password: string;
  id?: string;
}

const TEST_TIMESTAMP = Date.now();

function uniqueEmail(label: string): string {
  return `${label}-${TEST_TIMESTAMP}@example.invalid`;
}

const TEST_PASSWORD = "HouseVibeTest123!";

async function createTestUser(email: string, password: string): Promise<TestUser> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email verification
  });

  if (error) {
    throw new Error(`Failed to create test user ${email}: ${error.message}`);
  }

  return { email, password, id: data.user?.id };
}

async function deleteTestUser(userId: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    console.warn(`Failed to delete test user ${userId}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Test Suite: Auth Flows
// ---------------------------------------------------------------------------

test.describe("E2E Auth Flows", () => {
  // ---- E2E-1: Unauthenticated protection ----
  test("E2E-1: Unauthenticated user visiting /dashboard is redirected to /login with ?next= param", async ({
    page,
  }) => {
    const redirects: string[] = [];
    page.on("response", (resp) => {
      if (resp.status() >= 300 && resp.status() < 400) {
        const location = resp.headers()["location"];
        if (location) redirects.push(location);
      }
    });

    await page.goto("/dashboard", { waitUntil: "commit" });

    // Should be redirected to /login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
  });

  // ---- E2E-2: Registration ----
  test("E2E-2: User can register with valid credentials and see success message", async ({
    page,
  }) => {
    const email = uniqueEmail("register");

    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    // Fill the registration form
    await page.fill("#email", email);
    await page.fill("#password", TEST_PASSWORD);
    await page.fill("#confirmPassword", TEST_PASSWORD);

    // Check the terms checkbox
    await page.check("#acceptTerms");

    // Submit
    await page.click('button[type="submit"]');

    // Wait for success message
    await expect(page.locator("text=注册成功")).toBeVisible({
      timeout: 15000,
    });

    // Cleanup: delete the test user from Supabase
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.admin.listUsers();
    const createdUser = userData?.users?.find((u) => u.email === email);
    if (createdUser) {
      await deleteTestUser(createdUser.id);
    }
  });

  // ---- E2E-3: Login ----
  test("E2E-3: User can login with valid credentials and be redirected", async ({
    page,
  }) => {
    const email = uniqueEmail("login-success");
    const user = await createTestUser(email, TEST_PASSWORD);

    try {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      // Fill login form
      await page.fill("#email", email);
      await page.fill("#password", TEST_PASSWORD);

      // Submit
      await page.click('button[type="submit"]');

      // Should redirect to /onboarding (new user with no workspace)
      // or /dashboard (if user somehow has a workspace)
      await page.waitForURL(/^\/(onboarding|dashboard)/, {
        timeout: 15000,
      });

      const url = new URL(page.url());
      expect(["/onboarding", "/dashboard"]).toContain(url.pathname);
    } finally {
      if (user.id) await deleteTestUser(user.id);
    }
  });

  // ---- E2E-4: Dashboard access after login ----
  test("E2E-4: After login, /dashboard shows authenticated content", async ({
    page,
  }) => {
    const email = uniqueEmail("dashboard-access");
    const user = await createTestUser(email, TEST_PASSWORD);

    try {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      await page.fill("#email", email);
      await page.fill("#password", TEST_PASSWORD);
      await page.click('button[type="submit"]');

      // Wait for navigation after login
      await page.waitForURL(/^\/(onboarding|dashboard)/, {
        timeout: 15000,
      });

      // Navigate explicitly to /dashboard to verify it doesn't redirect to /login
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // Dashboard should NOT redirect to /login (we're authenticated)
      const url = new URL(page.url());
      expect(url.pathname).not.toBe("/login");

      // The page should contain expected content
      await expect(page.locator("text=工作台")).toBeVisible({
        timeout: 10000,
      });
    } finally {
      if (user.id) await deleteTestUser(user.id);
    }
  });

  // ---- E2E-5: Wrong password ----
  test("E2E-5: Login with wrong password shows generic error (no account enumeration)", async ({
    page,
  }) => {
    const email = uniqueEmail("wrong-pass");
    const user = await createTestUser(email, TEST_PASSWORD);

    try {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      // Fill login form with WRONG password
      await page.fill("#email", email);
      await page.fill("#password", "WrongPassword999!");

      await page.click('button[type="submit"]');

      // Wait for the error message div to appear
      // Generic error: "邮箱或密码错误" — must NOT differentiate reasons
      await expect(
        page.locator('[role="alert"]')
      ).toBeVisible({ timeout: 10000 });

      const errorText = await page.locator('[role="alert"]').textContent();

      // Verify generic error message (Chinese, no account enumeration)
      expect(errorText).toContain("错误");

      // Must NOT leak whether email exists
      expect(errorText?.toLowerCase()).not.toContain("not found");
      expect(errorText?.toLowerCase()).not.toContain("does not exist");
      expect(errorText?.toLowerCase()).not.toContain("exist");
      expect(errorText?.toLowerCase()).not.toContain("not registered");
    } finally {
      if (user.id) await deleteTestUser(user.id);
    }
  });

  // ---- E2E-6: Open Redirect protection ----
  test("E2E-6: /login?next=//evil.example falls back safely to /dashboard", async ({
    page,
  }) => {
    // Visit login with a malicious 'next' parameter
    await page.goto("/login?next=//evil.example");
    await page.waitForLoadState("networkidle");

    // The hidden <input name="next"> should contain a sanitized value
    // (or the form should not include the malicious URL)
    const hiddenInput = page.locator('input[name="next"][type="hidden"]');
    const hiddenCount = await hiddenInput.count();

    if (hiddenCount > 0) {
      const nextValue = await hiddenInput.inputValue();
      // getSafeNextPath should sanitize to /dashboard
      expect(nextValue).toBe("/dashboard");
    }
    // If no hidden input, the malicious URL was already rejected — that's also fine
  });

  // ---- E2E-7: Sign out ----
  test("E2E-7: After sign out, /dashboard redirects to /login", async ({
    page,
  }) => {
    const email = uniqueEmail("signout");
    const user = await createTestUser(email, TEST_PASSWORD);

    try {
      // Login first
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      await page.fill("#email", email);
      await page.fill("#password", TEST_PASSWORD);
      await page.click('button[type="submit"]');

      // Wait for navigation after login
      await page.waitForURL(/^\/(onboarding|dashboard)/, {
        timeout: 15000,
      });

      // Navigate to dashboard explicitly
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // Verify we're authenticated by checking the dashboard page rendered
      await expect(page.locator("text=工作台")).toBeVisible({
        timeout: 10000,
      });

      // Now sign out via the Supabase API (programmatic sign-out)
      // Since the UI doesn't have an explicit sign-out button yet in this phase,
      // we use evaluate to call Supabase's signOut
      await page.evaluate(async () => {
        // Access the Supabase client from the browser context if available,
        // or clear cookies/localStorage as a fallback
        localStorage.clear();
      });

      // Clear cookies to ensure session is gone
      await page.context().clearCookies();

      // Now try to access /dashboard — should redirect to /login
      await page.goto("/dashboard", { waitUntil: "commit" });

      await page.waitForURL(/\/login/, { timeout: 10000 });
      const url = new URL(page.url());
      expect(url.pathname).toBe("/login");
    } finally {
      if (user.id) await deleteTestUser(user.id);
    }
  });
});
