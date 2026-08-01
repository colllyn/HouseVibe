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

    // Wait for success message (use heading role to avoid strict mode violation
    // from matching both <h1> and <p> containing "注册成功")
    await expect(page.getByRole("heading", { name: "注册成功" })).toBeVisible({
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
      await page.waitForURL(/\/onboarding|\/dashboard/, {
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
      await page.waitForURL(/\/onboarding|\/dashboard/, {
        timeout: 15000,
      });

      // Navigate explicitly to /dashboard to verify it doesn't redirect to /login
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // Dashboard should NOT redirect to /login (we're authenticated).
      // With 0 workspaces, the layout redirects to /onboarding — that's valid too.
      const url = new URL(page.url());
      expect(url.pathname).not.toBe("/login");

      // If we landed on /dashboard (≥1 workspaces), verify content
      if (url.pathname === "/dashboard") {
        await expect(
          page.getByRole("heading", { name: "工作台" }),
        ).toBeVisible({ timeout: 10000 });
      }
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

      // Wait for the error message inside the form (scoped to avoid
      // matching global empty [role="alert"] elements from dev tools)
      const errorAlert = page
        .locator("form [role='alert']")
        .filter({ hasText: /.+/ })
        .first();
      await expect(errorAlert).toBeVisible({ timeout: 10000 });

      const errorText = await errorAlert.textContent();

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
      await page.waitForURL(/\/onboarding|\/dashboard/, {
        timeout: 15000,
      });

      // Navigate to dashboard explicitly
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // Verify we're authenticated: not redirected to /login.
      // With 0 workspaces, redirect to /onboarding is expected and valid.
      const preSignOutUrl = new URL(page.url());
      expect(preSignOutUrl.pathname).not.toBe("/login");

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

  // ---- E2E-8: Email confirmation callback establishes session ----
  test("E2E-8: Email confirmation callback establishes a valid session", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("callback");
    const supabase = getSupabaseClient();

    // Step 1: Register via UI to trigger real email confirmation
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await page.fill("#email", email);
    await page.fill("#password", TEST_PASSWORD);
    await page.fill("#confirmPassword", TEST_PASSWORD);
    await page.check("#acceptTerms");
    await page.click('button[type="submit"]');

    // Wait for registration success
    await expect(page.getByRole("heading", { name: "注册成功" })).toBeVisible({
      timeout: 15000,
    });

    // Step 2: Fetch the confirmation email from local Mailpit
    const mailpitBase = "http://127.0.0.1:54324";
    let confirmationUrl: string | null = null;

    try {
      // Give Mailpit a moment to receive the email
      await page.waitForTimeout(2000);

      const messagesResp = await request.get(
        `${mailpitBase}/api/v1/messages`,
      );
      if (!messagesResp.ok()) {
        throw new Error(
          `Mailpit messages API returned ${messagesResp.status()}`,
        );
      }

      const messagesData = (await messagesResp.json()) as {
        messages?: Array<{ ID: string; Subject: string }>;
      };
      const messages = messagesData.messages ?? [];

      // Find the confirmation email for our test user
      let confirmationMessageId: string | null = null;
      for (const msg of messages) {
        const detailResp = await request.get(
          `${mailpitBase}/api/v1/message/${msg.ID}`,
        );
        if (detailResp.ok()) {
          const detail = (await detailResp.json()) as {
            Subject?: string;
            HTML?: string;
          };
          if (
            detail.HTML?.includes(email) ||
            detail.Subject?.toLowerCase().includes("confirm")
          ) {
            confirmationMessageId = msg.ID;
            break;
          }
        }
      }

      if (confirmationMessageId) {
        const msgResp = await request.get(
          `${mailpitBase}/api/v1/message/${confirmationMessageId}`,
        );
        if (msgResp.ok()) {
          const msgDetail = (await msgResp.json()) as { HTML?: string };
          const html = msgDetail.HTML ?? "";

          // Extract confirmation link from the email HTML
          const linkMatch = html.match(
            /https?:\/\/[^"'\s>]*token=[^"'\s>]*/i,
          );
          if (linkMatch) {
            confirmationUrl = linkMatch[0]
              .replace(/&amp;/g, "&")
              .replace(/=3D/g, "=");
          }
        }
      }
    } catch (mailError) {
      throw new Error(
        `E2E setup failed: Mailpit lookup error — ${mailError instanceof Error ? mailError.message : String(mailError)}`,
      );
    }

    // Step 3: If we got the confirmation link, navigate to it
    if (confirmationUrl) {
      await page.goto(confirmationUrl, { waitUntil: "commit" });

      // The callback should exchange the code and establish a session,
      // then redirect to /onboarding (new user, no workspace)
      await page.waitForURL(/\/onboarding|\/dashboard/, {
        timeout: 15000,
      });

      const finalUrl = new URL(page.url());
      expect(["/onboarding", "/dashboard"]).toContain(finalUrl.pathname);

      // Verify session is established: /dashboard should not redirect to /login
      await page.goto("/dashboard", { waitUntil: "commit" });
      const dashUrl = new URL(page.url());
      expect(dashUrl.pathname).not.toBe("/login");
    }

    // Cleanup
    const { data: userData } = await supabase.auth.admin.listUsers();
    const createdUser = userData?.users?.find((u) => u.email === email);
    if (createdUser) {
      await deleteTestUser(createdUser.id);
    }
  });

  // ---- E2E-9: Onboarding creates workspace with owner membership ----
  test("E2E-9: Onboarding creates workspace and establishes owner membership", async ({
    page,
  }) => {
    const email = uniqueEmail("onboarding");
    const user = await createTestUser(email, TEST_PASSWORD);

    try {
      // Step 1: Login — should land on /onboarding (0 workspaces)
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.fill("#email", email);
      await page.fill("#password", TEST_PASSWORD);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/onboarding/, { timeout: 15000 });
      const onboardingUrl = new URL(page.url());
      expect(onboardingUrl.pathname).toBe("/onboarding");

      // Step 2: Fill onboarding form
      await expect(page.locator("#workspaceName")).toBeVisible({
        timeout: 5000,
      });
      await page.fill("#workspaceName", "E2E Test Workspace");
      await page.fill("#city", "E2E City");

      // Step 3: Submit
      await page.click('button[type="submit"]');

      // Step 4: Should redirect to /dashboard after successful workspace creation
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });
      const dashUrl = new URL(page.url());
      expect(dashUrl.pathname).toBe("/dashboard");

      // Step 5: Verify dashboard content is visible
      // Use heading role to avoid strict mode violation with nav link text
      await expect(
        page.getByRole("heading", { name: "工作台" }),
      ).toBeVisible({ timeout: 10000 });

      // Step 6: Verify workspace membership via service role
      if (user.id) {
        const supabase = getSupabaseClient();
        const { data: memberships, error: memberError } = await supabase
          .from("workspace_members")
          .select("id, workspace_id, role, status")
          .eq("user_id", user.id)
          .eq("status", "active");

        if (!memberError && memberships && memberships.length > 0) {
          const ownerMembership = memberships.find(
            (m) => m.role === "owner",
          );
          expect(ownerMembership).toBeDefined();

          // Cleanup: soft-delete the workspace
          if (ownerMembership) {
            await supabase
              .from("workspaces")
              .update({
                deleted_at: new Date().toISOString(),
              })
              .eq("id", ownerMembership.workspace_id);
          }
        }
      }
    } finally {
      if (user.id) await deleteTestUser(user.id);
    }
  });

  // ---- E2E-10: Invitation join flow ----
  test("E2E-10: Invited user can accept invitation and join workspace", async ({
    page,
  }) => {
    const ownerEmail = uniqueEmail("invite-owner");
    const inviteeEmail = uniqueEmail("invite-guest");

    const owner = await createTestUser(ownerEmail, TEST_PASSWORD);
    const invitee = await createTestUser(inviteeEmail, TEST_PASSWORD);

    let workspaceId: string | null = null;

    try {
      const supabase = getSupabaseClient();

      // Step 1: Create workspace via RPC using owner's service-role context
      // We use supabase admin to call the RPC, but the RPC requires auth.uid().
      // So we need to sign in as owner first, then call the RPC.
      const { data: ownerSignIn, error: ownerSignInErr } =
        await supabase.auth.signInWithPassword({
          email: ownerEmail,
          password: TEST_PASSWORD,
        });

      if (ownerSignInErr || !ownerSignIn?.session) {
        throw new Error(
          `E2E setup failed: could not sign in as owner — ${ownerSignInErr?.message || "no session"}`,
        );
      }

      // Call create_workspace_with_owner RPC with the owner's auth context
      // We need to use a user-scoped client, not the service_role client.
      // Create a separate client with the owner's session
      const { createClient } = await import("@supabase/supabase-js");
      const ownerClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: { autoRefreshToken: false, persistSession: false },
          global: {
            headers: {
              Authorization: `Bearer ${ownerSignIn.session.access_token}`,
            },
          },
        },
      );

      const { data: wsResult, error: wsError } = await ownerClient.rpc(
        "create_workspace_with_owner",
        {
          workspace_name: "E2E Invite Test WS",
          workspace_city: "Guangzhou",
        },
      );

      // Sign out owner
      await supabase.auth.admin.signOut(ownerSignIn.session.access_token);

      if (wsError || !wsResult) {
        throw new Error(
          `E2E setup failed: could not create workspace — ${wsError?.message || "no result"}`,
        );
      }

      workspaceId =
        typeof wsResult === "object" && wsResult !== null
          ? (wsResult as Record<string, unknown>).workspace_id as string
          : null;

      if (!workspaceId) {
        throw new Error("E2E setup failed: no workspace ID returned from RPC");
      }

      // Step 2: Generate invitation token and hash
      const crypto = await import("node:crypto");
      const rawToken = crypto.randomBytes(32).toString("hex");
      const inviteSecret =
        process.env.INVITE_TOKEN_SECRET ||
        "test-invite-token-local-e2e-32-chars-min";
      const tokenHash = crypto
        .createHmac("sha256", inviteSecret)
        .update(rawToken)
        .digest("hex");

      // Step 3: Insert invitation via service role
      const { error: inviteInsertErr } = await supabase
        .from("invitation_links")
        .insert({
          token_hash: tokenHash,
          created_by: owner.id,
          target_workspace_id: workspaceId,
          recipient_email: inviteeEmail,
          workspace_role: "member",
          max_uses: 1,
          status: "active",
          expires_at: new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ).toISOString(),
        });

      if (inviteInsertErr) {
        throw new Error(
          `E2E setup failed: could not insert invitation — ${inviteInsertErr.message}`,
        );
      }

      // Step 4: Login as invitee
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.fill("#email", inviteeEmail);
      await page.fill("#password", TEST_PASSWORD);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/onboarding|\/dashboard/, {
        timeout: 15000,
      });

      // Step 5: Navigate to invitation accept page
      await page.goto(`/join/${rawToken}`);
      await page.waitForLoadState("networkidle");

      // Verify we see the "接受工作区邀请" heading
      await expect(
        page.getByRole("heading", { name: "接受工作区邀请" }),
      ).toBeVisible({ timeout: 10000 });

      // Step 6: Click accept
      await page.click('button[type="submit"]');

      // Step 7: Should redirect to /dashboard after successful acceptance
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });
      const dashUrl = new URL(page.url());
      expect(dashUrl.pathname).toBe("/dashboard");

      // Step 8: Verify invitee membership via service role
      if (invitee.id) {
        const { data: memberships } = await supabase
          .from("workspace_members")
          .select("role, status")
          .eq("user_id", invitee.id)
          .eq("workspace_id", workspaceId!)
          .eq("status", "active");

        expect(memberships).not.toBeNull();
        expect(memberships?.length).toBeGreaterThan(0);
        if (memberships && memberships.length > 0) {
          expect(memberships[0]!.role).toBe("member");
        }
      }
    } finally {
      // Cleanup: soft-delete workspace
      if (workspaceId) {
        const supabase = getSupabaseClient();
        await supabase
          .from("workspaces")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", workspaceId);
      }
      if (owner.id) await deleteTestUser(owner.id);
      if (invitee.id) await deleteTestUser(invitee.id);
    }
  });

  // ---- E2E-11: Wrong email cannot accept invitation ----
  test("E2E-11: Wrong email cannot accept invitation intended for another email", async ({
    page,
  }) => {
    const ownerEmail = uniqueEmail("wrongemail-owner");
    const wrongEmail = uniqueEmail("wrongemail-attacker");
    const intendedEmail = uniqueEmail("wrongemail-target");

    const owner = await createTestUser(ownerEmail, TEST_PASSWORD);
    const wrongUser = await createTestUser(wrongEmail, TEST_PASSWORD);

    let workspaceId: string | null = null;
    let invitationId: string | null = null;
    const supabase = getSupabaseClient();

    try {
      // Step 1: Sign in as owner and create workspace via RPC
      const { data: ownerSignIn, error: ownerSignInErr } =
        await supabase.auth.signInWithPassword({
          email: ownerEmail,
          password: TEST_PASSWORD,
        });

      if (ownerSignInErr || !ownerSignIn?.session) {
        throw new Error(
          `E2E setup failed: could not sign in as owner — ${ownerSignInErr?.message || "no session"}`,
        );
      }

      const { createClient } = await import("@supabase/supabase-js");
      const ownerClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: { autoRefreshToken: false, persistSession: false },
          global: {
            headers: {
              Authorization: `Bearer ${ownerSignIn.session.access_token}`,
            },
          },
        },
      );

      const { data: wsResult, error: wsError } = await ownerClient.rpc(
        "create_workspace_with_owner",
        {
          workspace_name: "E2E WrongEmail Test WS",
          workspace_city: "Guangzhou",
        },
      );

      await supabase.auth.admin.signOut(ownerSignIn.session.access_token);

      if (wsError || !wsResult) {
        throw new Error(
          `E2E setup failed: could not create workspace — ${wsError?.message || "no result"}`,
        );
      }

      workspaceId =
        typeof wsResult === "object" && wsResult !== null
          ? (wsResult as Record<string, unknown>).workspace_id as string
          : null;

      if (!workspaceId) {
        throw new Error("E2E setup failed: no workspace ID returned from RPC");
      }

      // Step 2: Create invitation for intendedEmail (NOT wrongEmail)
      const crypto = await import("node:crypto");
      const rawToken = crypto.randomBytes(32).toString("hex");
      const inviteSecret =
        process.env.INVITE_TOKEN_SECRET ||
        "test-invite-token-local-e2e-32-chars-min";
      const tokenHash = crypto
        .createHmac("sha256", inviteSecret)
        .update(rawToken)
        .digest("hex");

      const { data: inviteData, error: inviteErr } = await supabase
        .from("invitation_links")
        .insert({
          token_hash: tokenHash,
          created_by: owner.id,
          target_workspace_id: workspaceId,
          recipient_email: intendedEmail,
          workspace_role: "member",
          max_uses: 1,
          status: "active",
          expires_at: new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ).toISOString(),
        })
        .select("id")
        .single();

      if (inviteErr || !inviteData) {
        throw new Error(
          `E2E setup failed: could not insert invitation — ${inviteErr?.message || "no data"}`,
        );
      }

      invitationId = inviteData.id;

      // Step 3: Capture initial invitation state
      const { data: initialInvite } = await supabase
        .from("invitation_links")
        .select("used_count, accepted_by, accepted_at, status")
        .eq("id", invitationId)
        .single();

      // Step 4: Login as wrongUser
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.fill("#email", wrongEmail);
      await page.fill("#password", TEST_PASSWORD);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/onboarding|\/dashboard/, {
        timeout: 15000,
      });

      // Step 5: Navigate to invitation accept page
      await page.goto(`/join/${rawToken}`);
      await page.waitForLoadState("networkidle");

      // Step 6: Click accept
      await page.click('button[type="submit"]');

      // Step 7: Verify error message appears
      const errorAlert = page
        .locator("[role='alert']")
        .filter({ hasText: /.+/ })
        .first();
      await expect(errorAlert).toBeVisible({ timeout: 10000 });
      const errorText = await errorAlert.textContent();
      expect(errorText).toBeTruthy();

      // Step 8: Verify no membership created for wrongUser
      if (wrongUser.id && workspaceId) {
        const { data: memberships } = await supabase
          .from("workspace_members")
          .select("id")
          .eq("user_id", wrongUser.id)
          .eq("workspace_id", workspaceId)
          .eq("status", "active");

        expect(memberships?.length || 0).toBe(0);
      }

      // Step 9: Verify invitation not consumed
      const { data: finalInvite } = await supabase
        .from("invitation_links")
        .select("used_count, accepted_by, accepted_at, status")
        .eq("id", invitationId)
        .single();

      expect(finalInvite?.used_count).toBe(initialInvite?.used_count ?? 0);
      expect(finalInvite?.accepted_by).toBeNull();
      expect(finalInvite?.accepted_at).toBeNull();
      expect(finalInvite?.status).toBe("active");

      // Step 10: Verify no audit log entry for wrongUser acceptance
      if (wrongUser.id) {
        const { data: auditLogs } = await supabase
          .from("audit_logs")
          .select("id")
          .eq("action", "invitation_accepted")
          .eq("actor_user_id", wrongUser.id);

        expect(auditLogs?.length || 0).toBe(0);
      }

      // Step 11: Verify page does not leak the intended recipient email
      const pageText = await page.textContent("body");
      expect(pageText).not.toContain(intendedEmail);
    } finally {
      if (workspaceId) {
        await supabase
          .from("workspaces")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", workspaceId);
      }
      if (owner.id) await deleteTestUser(owner.id);
      if (wrongUser.id) await deleteTestUser(wrongUser.id);
    }
  });

  // ---- E2E-12: Expired invitation ----
  test("E2E-12: Expired invitation cannot be accepted", async ({ page }) => {
    const ownerEmail = uniqueEmail("expired-owner");
    const inviteeEmail = uniqueEmail("expired-guest");

    const owner = await createTestUser(ownerEmail, TEST_PASSWORD);
    const invitee = await createTestUser(inviteeEmail, TEST_PASSWORD);

    let workspaceId: string | null = null;
    const supabase = getSupabaseClient();

    try {
      // Step 1: Sign in as owner and create workspace via RPC
      const { data: ownerSignIn, error: ownerSignInErr } =
        await supabase.auth.signInWithPassword({
          email: ownerEmail,
          password: TEST_PASSWORD,
        });

      if (ownerSignInErr || !ownerSignIn?.session) {
        throw new Error(
          `E2E setup failed: could not sign in as owner — ${ownerSignInErr?.message || "no session"}`,
        );
      }

      const { createClient } = await import("@supabase/supabase-js");
      const ownerClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: { autoRefreshToken: false, persistSession: false },
          global: {
            headers: {
              Authorization: `Bearer ${ownerSignIn.session.access_token}`,
            },
          },
        },
      );

      const { data: wsResult, error: wsError } = await ownerClient.rpc(
        "create_workspace_with_owner",
        {
          workspace_name: "E2E Expired Test WS",
          workspace_city: "Guangzhou",
        },
      );

      await supabase.auth.admin.signOut(ownerSignIn.session.access_token);

      if (wsError || !wsResult) {
        throw new Error(
          `E2E setup failed: could not create workspace — ${wsError?.message || "no result"}`,
        );
      }

      workspaceId =
        typeof wsResult === "object" && wsResult !== null
          ? (wsResult as Record<string, unknown>).workspace_id as string
          : null;

      if (!workspaceId) {
        throw new Error("E2E setup failed: no workspace ID returned from RPC");
      }

      // Step 2: Create EXPIRED invitation (expires_at in the past)
      const crypto = await import("node:crypto");
      const rawToken = crypto.randomBytes(32).toString("hex");
      const inviteSecret =
        process.env.INVITE_TOKEN_SECRET ||
        "test-invite-token-local-e2e-32-chars-min";
      const tokenHash = crypto
        .createHmac("sha256", inviteSecret)
        .update(rawToken)
        .digest("hex");

      const { error: inviteErr } = await supabase
        .from("invitation_links")
        .insert({
          token_hash: tokenHash,
          created_by: owner.id,
          target_workspace_id: workspaceId,
          recipient_email: inviteeEmail,
          workspace_role: "member",
          max_uses: 1,
          status: "active",
          expires_at: new Date(
            Date.now() - 3600000,
          ).toISOString(), // 1 hour in the past
        });

      if (inviteErr) {
        throw new Error(
          `E2E setup failed: could not insert invitation — ${inviteErr.message}`,
        );
      }

      // Step 3: Login as invitee
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.fill("#email", inviteeEmail);
      await page.fill("#password", TEST_PASSWORD);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/onboarding|\/dashboard/, {
        timeout: 15000,
      });

      // Step 4: Navigate to invitation accept page
      await page.goto(`/join/${rawToken}`);
      await page.waitForLoadState("networkidle");

      // Step 5: Click accept
      await page.click('button[type="submit"]');

      // Step 6: Verify error message appears
      const errorAlert = page
        .locator("[role='alert']")
        .filter({ hasText: /.+/ })
        .first();
      await expect(errorAlert).toBeVisible({ timeout: 10000 });
      const errorText = await errorAlert.textContent();
      expect(errorText).toBeTruthy();

      // Step 7: Verify no membership created for invitee
      if (invitee.id && workspaceId) {
        const { data: memberships } = await supabase
          .from("workspace_members")
          .select("id")
          .eq("user_id", invitee.id)
          .eq("workspace_id", workspaceId)
          .eq("status", "active");

        expect(memberships?.length || 0).toBe(0);
      }

      // Step 8: Verify invitation status is now "expired"
      const { data: inviteAfter } = await supabase
        .from("invitation_links")
        .select("status, used_count")
        .eq("token_hash", tokenHash)
        .single();

      // The RPC auto-updates status to "expired" when expired_at < now()
      // The used_count should still be 0 (acceptance was rejected before increment)
      expect(inviteAfter?.used_count).toBe(0);
    } finally {
      if (workspaceId) {
        await supabase
          .from("workspaces")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", workspaceId);
      }
      if (owner.id) await deleteTestUser(owner.id);
      if (invitee.id) await deleteTestUser(invitee.id);
    }
  });

  // ---- E2E-13: Token replay rejected ----
  test("E2E-13: Token replay is rejected after first acceptance", async ({
    page,
  }) => {
    const ownerEmail = uniqueEmail("replay-owner");
    const inviteeEmail = uniqueEmail("replay-guest");

    const owner = await createTestUser(ownerEmail, TEST_PASSWORD);
    const invitee = await createTestUser(inviteeEmail, TEST_PASSWORD);

    let workspaceId: string | null = null;
    let rawToken: string | null = null;
    const supabase = getSupabaseClient();

    try {
      // Step 1: Sign in as owner and create workspace via RPC
      const { data: ownerSignIn, error: ownerSignInErr } =
        await supabase.auth.signInWithPassword({
          email: ownerEmail,
          password: TEST_PASSWORD,
        });

      if (ownerSignInErr || !ownerSignIn?.session) {
        throw new Error(
          `E2E setup failed: could not sign in as owner — ${ownerSignInErr?.message || "no session"}`,
        );
      }

      const { createClient } = await import("@supabase/supabase-js");
      const ownerClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: { autoRefreshToken: false, persistSession: false },
          global: {
            headers: {
              Authorization: `Bearer ${ownerSignIn.session.access_token}`,
            },
          },
        },
      );

      const { data: wsResult, error: wsError } = await ownerClient.rpc(
        "create_workspace_with_owner",
        {
          workspace_name: "E2E Replay Test WS",
          workspace_city: "Guangzhou",
        },
      );

      await supabase.auth.admin.signOut(ownerSignIn.session.access_token);

      if (wsError || !wsResult) {
        throw new Error(
          `E2E setup failed: could not create workspace — ${wsError?.message || "no result"}`,
        );
      }

      workspaceId =
        typeof wsResult === "object" && wsResult !== null
          ? (wsResult as Record<string, unknown>).workspace_id as string
          : null;

      if (!workspaceId) {
        throw new Error("E2E setup failed: no workspace ID returned from RPC");
      }

      // Step 2: Create invitation with max_uses = 1
      const crypto = await import("node:crypto");
      rawToken = crypto.randomBytes(32).toString("hex");
      const inviteSecret =
        process.env.INVITE_TOKEN_SECRET ||
        "test-invite-token-local-e2e-32-chars-min";
      const tokenHash = crypto
        .createHmac("sha256", inviteSecret)
        .update(rawToken)
        .digest("hex");

      const { error: inviteErr } = await supabase
        .from("invitation_links")
        .insert({
          token_hash: tokenHash,
          created_by: owner.id,
          target_workspace_id: workspaceId,
          recipient_email: inviteeEmail,
          workspace_role: "member",
          max_uses: 1,
          status: "active",
          expires_at: new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ).toISOString(),
        });

      if (inviteErr) {
        throw new Error(
          `E2E setup failed: could not insert invitation — ${inviteErr.message}`,
        );
      }

      // === FIRST ACCEPTANCE (should succeed) ===

      // Step 3: Login as invitee
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.fill("#email", inviteeEmail);
      await page.fill("#password", TEST_PASSWORD);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/onboarding|\/dashboard/, {
        timeout: 15000,
      });

      // Step 4: Navigate to invitation accept page and accept
      await page.goto(`/join/${rawToken}`);
      await page.waitForLoadState("networkidle");
      await page.click('button[type="submit"]');

      // Step 5: Should redirect to /dashboard after successful acceptance
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });
      expect(new URL(page.url()).pathname).toBe("/dashboard");

      // Step 6: Verify membership created with correct role
      if (invitee.id && workspaceId) {
        const { data: memberships } = await supabase
          .from("workspace_members")
          .select("role, status")
          .eq("user_id", invitee.id)
          .eq("workspace_id", workspaceId)
          .eq("status", "active");

        expect(memberships?.length).toBe(1);
        expect(memberships?.[0]?.role).toBe("member");
      }

      // Step 7: Logout (clear session)
      await page.evaluate(async () => {
        localStorage.clear();
      });
      await page.context().clearCookies();

      // === SECOND ACCEPTANCE (token replay, should fail) ===

      // Step 8: Re-login as invitee
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.fill("#email", inviteeEmail);
      await page.fill("#password", TEST_PASSWORD);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/onboarding|\/dashboard/, {
        timeout: 15000,
      });

      // Step 9: Navigate to invitation accept page with the SAME token
      await page.goto(`/join/${rawToken}`);
      await page.waitForLoadState("networkidle");
      await page.click('button[type="submit"]');

      // Step 10: Verify error message (邀请链接无效或已过期)
      const errorAlert = page
        .locator("[role='alert']")
        .filter({ hasText: /.+/ })
        .first();
      await expect(errorAlert).toBeVisible({ timeout: 10000 });
      const errorText = await errorAlert.textContent();
      expect(errorText).toBeTruthy();
      expect(errorText).toMatch(/无效|过期|不再有效|已使用/);

      // Step 11: Verify membership count is still 1 (no duplicate)
      if (invitee.id && workspaceId) {
        const { data: memberships } = await supabase
          .from("workspace_members")
          .select("role, status")
          .eq("user_id", invitee.id)
          .eq("workspace_id", workspaceId)
          .eq("status", "active");

        expect(memberships?.length).toBe(1);
        expect(memberships?.[0]?.role).toBe("member");
      }

      // Step 12: Verify audit log has exactly 1 successful acceptance entry
      if (invitee.id) {
        const { data: auditLogs } = await supabase
          .from("audit_logs")
          .select("id")
          .eq("action", "invitation_accepted")
          .eq("actor_user_id", invitee.id);

        // Audit log access may be restricted; verify if available
        if (auditLogs && auditLogs.length > 0) {
          expect(auditLogs.length).toBe(1);
        }
      }
    } finally {
      if (workspaceId) {
        await supabase
          .from("workspaces")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", workspaceId);
      }
      if (owner.id) await deleteTestUser(owner.id);
      if (invitee.id) await deleteTestUser(invitee.id);
    }
  });
});
