import { describe, it, expect, vi, afterEach } from "vitest";
import { getPublicEnv, getServerEnv } from "@/config/env";

const VALID_PUBLIC_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test",
  NEXT_PUBLIC_APP_URL: "https://housevibe.example.com",
};

function setEnv(vars: Record<string, string | undefined>) {
  for (const k of Object.keys(vars)) {
    const v = vars[k];
    if (v === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

function clearEnv(vars: Record<string, string | undefined>) {
  for (const k of Object.keys(vars)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete process.env[k];
  }
}

describe("getPublicEnv", () => {
  afterEach(() => { clearEnv(VALID_PUBLIC_ENV); vi.unstubAllGlobals(); });

  it("parses valid NEXT_PUBLIC_* variables correctly", () => {
    setEnv(VALID_PUBLIC_ENV);
    const env = getPublicEnv();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abc123.supabase.co");
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://housevibe.example.com");
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    setEnv({ ...VALID_PUBLIC_ENV, NEXT_PUBLIC_SUPABASE_URL: undefined });
    expect(() => getPublicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("error message names the missing variable but does NOT leak its value", () => {
    setEnv({ ...VALID_PUBLIC_ENV, NEXT_PUBLIC_SUPABASE_URL: undefined });
    let message = "";
    try { getPublicEnv(); } catch (e) { message = (e as Error).message; }
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(message).not.toContain("https://abc123.supabase.co");
  });

  it("does NOT expose server secrets", () => {
    setEnv({ ...VALID_PUBLIC_ENV, SUPABASE_SERVICE_ROLE_KEY: "secret-role" });
    const keys = Object.keys(getPublicEnv());
    expect(keys).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("getServerEnv", () => {
  const VARS: Record<string, string | undefined> = {
    ...VALID_PUBLIC_ENV,
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    DEEPSEEK_API_KEY: "sk-deepseek-test",
    DEEPSEEK_VISION_BASE_URL_PRIMARY: "https://vision1.example.com",
    DEEPSEEK_VISION_BASE_URL_FALLBACK: "https://vision2.example.com",
    DEEPSEEK_VISION_API_KEY: "sk-vision-test",
    INVITE_TOKEN_SECRET: "0123456789abcdef0123456789abcdef01",
  };

  afterEach(() => { clearEnv(VARS); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("throws when called from browser context", () => {
    setEnv(VARS);
    expect(() => getServerEnv()).toThrow(/browser context/);
  });

  it("succeeds in server context", () => {
    vi.stubGlobal("window", undefined);
    setEnv(VARS);
    const env = getServerEnv();
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("service-role-key");
    expect(env.DEEPSEEK_API_KEY).toBe("sk-deepseek-test");
  });

  it("applies default for DEEPSEEK_TEXT_MODEL_PRIMARY", () => {
    vi.stubGlobal("window", undefined);
    setEnv(VARS);
    expect(getServerEnv().DEEPSEEK_TEXT_MODEL_PRIMARY).toBe("deepseek-chat");
  });

  it("error message does not leak secret values", () => {
    vi.stubGlobal("window", undefined);
    setEnv({ ...VARS, DEEPSEEK_API_KEY: undefined });
    let message = "";
    try { getServerEnv(); } catch (e) { message = (e as Error).message; }
    expect(message).toContain("DEEPSEEK_API_KEY");
    expect(message).not.toContain("sk-vision-test");
  });
});
