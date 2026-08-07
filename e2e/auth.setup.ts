/**
 * Auth state setup — performs real browser login and saves storageState.
 * Run before Property E2E tests.
 *
 * Service Role used ONLY for test user creation (not passed to browser or Next.js).
 */

import { test as setup, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const AUTH_DIR = path.resolve(__dirname, ".auth");
const OWNER_STATE = path.join(AUTH_DIR, "owner.json");
const MEMBER_STATE = path.join(AUTH_DIR, "member.json");
const OTHER_STATE = path.join(AUTH_DIR, "other.json");
const CONTENT_FACTORY_STATE = path.join(AUTH_DIR, "content-factory.json");

const TEST_PASSWORD = "HouseVibeTest123!";
const TS = Date.now();

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars for E2E setup");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function createUser(email: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.createUser({
    email, password: TEST_PASSWORD, email_confirm: true,
  });
  if (error) throw new Error(`Failed to create user ${email}: ${error.message}`);
  return data.user!.id;
}

async function deleteUser(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.auth.admin.deleteUser(userId);
}

async function doLogin(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
  workspaceName: string
) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15000 });

  if (page.url().includes("/onboarding")) {
    await page.fill('input[name="workspaceName"]', workspaceName);
    await page.fill('input[name="city"]', "Beijing");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  }

  // Verify we're authenticated (dashboard loads, no redirect to login)
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  expect(page.url()).not.toContain("/login");
}

setup("create owner auth state", async ({ browser }) => {
  // Ensure .auth directory exists
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const email = `prop-owner-${TS}@example.invalid`;
  const userId = await createUser(email);

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await doLogin(page, email, TEST_PASSWORD, "Property-E2E-WS");
    await context.storageState({ path: OWNER_STATE });
    console.log(`[auth.setup] Owner state saved: ${OWNER_STATE}`);
  } finally {
    await context.close();
    // Store user ID for cleanup — write to a temp file
    fs.writeFileSync(OWNER_STATE + ".userid", userId);
  }
});

setup("create member auth state", async ({ browser }) => {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const email = `prop-member-${TS}@example.invalid`;
  const userId = await createUser(email);

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await doLogin(page, email, TEST_PASSWORD, "Property-E2E-Member-WS");
    await context.storageState({ path: MEMBER_STATE });
    console.log(`[auth.setup] Member state saved: ${MEMBER_STATE}`);
  } finally {
    await context.close();
    fs.writeFileSync(MEMBER_STATE + ".userid", userId);
  }
});

setup("create other-workspace auth state", async ({ browser }) => {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const email = `prop-other-${TS}@example.invalid`;
  const userId = await createUser(email);

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await doLogin(page, email, TEST_PASSWORD, "Property-E2E-Other-WS");
    await context.storageState({ path: OTHER_STATE });
    console.log(`[auth.setup] Other state saved: ${OTHER_STATE}`);
  } finally {
    await context.close();
    fs.writeFileSync(OTHER_STATE + ".userid", userId);
  }
});

setup("create content-factory auth state", async ({ browser }) => {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const email = `cf-user-${TS}@example.invalid`;
  const userId = await createUser(email);

  // Grant content_factory entitlement via service role
  const supabase = getSupabaseAdmin();
  await supabase.from("feature_entitlements").insert({
    user_id: userId,
    feature: "content_factory",
    status: "active",
    granted_by: userId, // self-granted for test
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await doLogin(page, email, TEST_PASSWORD, "Content-Factory-E2E-WS");
    await context.storageState({ path: CONTENT_FACTORY_STATE });
    console.log(`[auth.setup] Content factory state saved: ${CONTENT_FACTORY_STATE}`);
  } finally {
    await context.close();
    fs.writeFileSync(CONTENT_FACTORY_STATE + ".userid", userId);
  }
});

// Cleanup helper (exported for use after all tests)
export async function cleanupAuthUsers() {
  for (const stateFile of [OWNER_STATE, MEMBER_STATE, OTHER_STATE, CONTENT_FACTORY_STATE]) {
    const userIdFile = stateFile + ".userid";
    if (fs.existsSync(userIdFile)) {
      const userId = fs.readFileSync(userIdFile, "utf-8").trim();
      await deleteUser(userId);
      fs.unlinkSync(userIdFile);
    }
  }
}
