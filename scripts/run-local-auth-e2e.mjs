#!/usr/bin/env node

/**
 * run-local-auth-e2e.mjs
 * -----------------------
 * Launcher for local auth E2E tests.
 *
 * 1. Fetches local Supabase config via `supabase status -o json`.
 * 2. Extracts ONLY public config (API_URL + ANON_KEY). SERVICE_ROLE_KEY
 *    is NEVER forwarded to the app process.
 * 3. Uses a hardcoded, deterministic test-only INVITE_TOKEN_SECRET.
 * 4. Does NOT write to .env.local or any secrets file.
 * 5. Runs Playwright tests and cleans up child processes on exit.
 * 6. Returns non-zero exit code on any error.
 * 7. Never logs full invite tokens or secrets.
 */

import { execSync, spawn } from "node:child_process";
import process from "node:process";

// ---------------------------------------------------------------------------
// Deterministic test-only secret -- NOT used in production.
// This is intentionally hardcoded; it must never be derived from a real .env.
// ---------------------------------------------------------------------------
const TEST_INVITE_TOKEN_SECRET =
  "test-invite-token-local-e2e-32-chars-min";

// ---------------------------------------------------------------------------
// Fetch Supabase local status as JSON
// ---------------------------------------------------------------------------
function fetchSupabaseStatus() {
  /** @type {string} */
  let raw;
  try {
    raw = execSync("npx supabase status -o json", {
      encoding: "utf-8",
      timeout: 20_000,
      stdio: ["ignore", "pipe", "pipe"],
      // Ensure we use the project root so supabase finds its config
      cwd: new URL("..", import.meta.url).pathname,
    });
  } catch (err) {
    console.error(
      "[ERROR] Could not retrieve Supabase status. Is the local stack running?\n",
      "        Run `npx supabase start` and try again.\n",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }

  /** @type {Record<string, string>} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(
      "[ERROR] Failed to parse `supabase status` JSON output.\n",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Validate required keys
// ---------------------------------------------------------------------------
function validateKeys(status) {
  const apiUrl = status.API_URL;
  const anonKey = status.ANON_KEY;

  if (!apiUrl) {
    console.error("[ERROR] Supabase status is missing API_URL.");
    process.exit(1);
  }
  if (!anonKey) {
    console.error("[ERROR] Supabase status is missing ANON_KEY.");
    process.exit(1);
  }

  // Safety check: confirm we never accidentally pass the service role key
  if (status.SERVICE_ROLE_KEY) {
    console.log(
      "[OK]   SERVICE_ROLE_KEY present in Supabase status (will NOT be forwarded to app).",
    );
  }

  return { apiUrl, anonKey };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("[INFO] Fetching local Supabase configuration...");

  const status = fetchSupabaseStatus();
  const { apiUrl, anonKey } = validateKeys(status);

  console.log(`[INFO] NEXT_PUBLIC_SUPABASE_URL       = ${apiUrl}`);
  console.log(
    `[INFO] NEXT_PUBLIC_SUPABASE_ANON_KEY  = *** (${anonKey.length} chars)`,
  );
  console.log(
    `[INFO] INVITE_TOKEN_SECRET            = *** (hardcoded test value, ${TEST_INVITE_TOKEN_SECRET.length} chars)`,
  );

  // ---- Assemble environment (PUBLIC ONLY) ----------------------------------
  const env = {
    ...process.env,
    // Public Supabase
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    // App
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    // Test-only invite secret
    INVITE_TOKEN_SECRET: TEST_INVITE_TOKEN_SECRET,
  };

  // Explicitly omit SUPABASE_SERVICE_ROLE_KEY even if set in parent env.
  delete env.SUPABASE_SERVICE_ROLE_KEY;

  // ---- Spawn Playwright ----------------------------------------------------
  console.log("[INFO] Starting Playwright tests...\n");

  const child = spawn("npx", ["playwright", "test"], {
    env,
    stdio: "inherit",
    shell: true,
    cwd: new URL("..", import.meta.url).pathname,
  });

  /** @type {number | null} */
  let exitCode = null;

  // ----- Cleanup helpers ----------------------------------------------------
  const cleanup = () => {
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(1);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(1);
  });

  // ----- Await child completion ---------------------------------------------
  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`\n[ERROR] Playwright killed by signal ${signal}`);
      process.exit(1);
    }
    exitCode = code ?? 1;
    console.log(`\n[INFO] Playwright exited with code ${exitCode}`);
    process.exit(exitCode);
  });

  child.on("error", (err) => {
    console.error(`\n[ERROR] Failed to launch Playwright: ${err.message}`);
    process.exit(1);
  });
}

main();
