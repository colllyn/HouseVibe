import { defineConfig } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local so Playwright test processes have access to
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.
// (Next.js loads this automatically for the web server, but the
// Playwright test process runs as a separate Node.js process.
// Use process.cwd() to avoid import.meta issues with CJS loaders.)
try {
  const envPath = resolve(process.cwd(), ".env.local");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const eqIdx = trimmed.indexOf("=");
      const key = trimmed.slice(0, eqIdx).trim();
      const rawValue = trimmed.slice(eqIdx + 1).trim();
      const value = rawValue.replace(/^["']|["']$/g, "");
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
} catch {
  // .env.local not found — some tests may fail if they require env vars
  console.warn("[playwright.config] .env.local not found; some tests may fail");
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    // Auth state setup — runs first, creates storageState files
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    // Property E2E — uses saved auth state from setup
    // fullyParallel=false: tests share workspace; parallel deletes cause cache races
    {
      name: "properties",
      testMatch: /property-flows\.spec\.ts/,
      fullyParallel: false,
      use: {
        browserName: "chromium",
        storageState: "e2e/.auth/owner.json",
      },
      dependencies: ["setup"],
    },
    // Property Filter & Sort E2E
    {
      name: "property-filters",
      testMatch: /property-filters\.spec\.ts/,
      fullyParallel: false,
      use: {
        browserName: "chromium",
        storageState: "e2e/.auth/owner.json",
      },
      dependencies: ["setup"],
    },
    // Property Media E2E
    {
      name: "property-media",
      testMatch: /property-media\.spec\.ts/,
      fullyParallel: false,
      use: {
        browserName: "chromium",
        storageState: "e2e/.auth/owner.json",
      },
      dependencies: ["setup"],
    },
    // Client CRUD E2E
    {
      name: "clients",
      testMatch: /client-flows\.spec\.ts/,
      fullyParallel: false,
      use: {
        browserName: "chromium",
        storageState: "e2e/.auth/owner.json",
      },
      dependencies: ["setup"],
    },
    // Client Interactions E2E
    {
      name: "client-interactions",
      testMatch: /client-interactions\.spec\.ts/,
      fullyParallel: false,
      use: {
        browserName: "chromium",
        storageState: "e2e/.auth/owner.json",
      },
      dependencies: ["setup"],
    },
    // Property Matching E2E
    {
      name: "matching",
      testMatch: /matching-flows\.spec\.ts/,
      fullyParallel: false,
      use: {
        browserName: "chromium",
        storageState: "e2e/.auth/owner.json",
      },
      dependencies: ["setup"],
    },
    // Default chromium (auth, admin, settings E2E — no storageState needed)
    {
      name: "chromium",
      testMatch: /^(?!.*(auth\.setup|property-flows|property-filters|property-media|client-flows|client-interactions|matching-flows)).*\.spec\.ts$/,
      use: { browserName: "chromium" },
    },
  ],
});
