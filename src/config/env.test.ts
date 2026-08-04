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
    setEnv({ ...VALID_PUBLIC_ENV, DEEPSEEK_API_KEY: "sk-secret" });
    const keys = Object.keys(getPublicEnv());
    expect(keys).not.toContain("DEEPSEEK_API_KEY");
  });
});

describe("getServerEnv", () => {
  const VARS: Record<string, string | undefined> = {
    ...VALID_PUBLIC_ENV,
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
    expect(env.DEEPSEEK_API_KEY).toBe("sk-deepseek-test");
  });

  it("applies default for DEEPSEEK_MODEL", () => {
    vi.stubGlobal("window", undefined);
    setEnv(VARS);
    expect(getServerEnv().DEEPSEEK_MODEL).toBe("deepseek-v4-flash");
  });

  it("applies default for DEEPSEEK_FALLBACK_MODEL", () => {
    vi.stubGlobal("window", undefined);
    setEnv(VARS);
    expect(getServerEnv().DEEPSEEK_FALLBACK_MODEL).toBe("deepseek-v4-pro");
  });

  it("succeeds without AI configuration (all AI vars are optional)", () => {
    vi.stubGlobal("window", undefined);
    const minimalVars = { ...VALID_PUBLIC_ENV, INVITE_TOKEN_SECRET: "0123456789abcdef0123456789abcdef01" };
    setEnv(minimalVars);
    // Must not throw — non-AI app functionality works without AI config
    const env = getServerEnv();
    expect(env.INVITE_TOKEN_SECRET).toBe("0123456789abcdef0123456789abcdef01");
    expect(env.DEEPSEEK_API_KEY).toBeUndefined();
  });

  it("error message does not leak secret values", () => {
    vi.stubGlobal("window", undefined);
    // INVITE_TOKEN_SECRET is still required (not optional)
    setEnv({ ...VARS, INVITE_TOKEN_SECRET: undefined });
    let message = "";
    try { getServerEnv(); } catch (e) { message = (e as Error).message; }
    expect(message).toContain("INVITE_TOKEN_SECRET");
    expect(message).not.toContain("sk-vision-test");
    expect(message).not.toContain("sk-deepseek-test");
  });
});

// ─── DeepSeek URL HTTPS-only validation ────────────────────────────────────

describe("DeepSeek URL enforcement", () => {
  const MIN_VARS: Record<string, string | undefined> = {
    ...VALID_PUBLIC_ENV,
    INVITE_TOKEN_SECRET: "0123456789abcdef0123456789abcdef01",
  };

  afterEach(() => {
    for (const k of [
      ...Object.keys(MIN_VARS),
      "DEEPSEEK_BASE_URL",
      "DEEPSEEK_VISION_BASE_URL_PRIMARY",
      "DEEPSEEK_VISION_BASE_URL_FALLBACK",
      "DEEPSEEK_API_KEY",
    ]) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env[k];
    }
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  /**
   * Prevent leakage from .env.local into tests that expect optional AI URLs to be absent.
   * The spread order ensures explicit vars override the forced undefined.
   */
  const NO_AI_URLS = {
    DEEPSEEK_BASE_URL: undefined,
    DEEPSEEK_VISION_BASE_URL_PRIMARY: undefined,
    DEEPSEEK_VISION_BASE_URL_FALLBACK: undefined,
  } as const;

  function ok(vars: Record<string, string | undefined>) {
    vi.stubGlobal("window", undefined);
    setEnv({ ...MIN_VARS, ...NO_AI_URLS, ...vars });
    return getServerEnv();
  }

  function fails(vars: Record<string, string | undefined>) {
    vi.stubGlobal("window", undefined);
    setEnv({ ...MIN_VARS, ...NO_AI_URLS, ...vars });
    expect(() => getServerEnv()).toThrow();
  }

  it("accepts missing URL — no AI config needed", () => {
    const env = ok({});
    expect(env.DEEPSEEK_BASE_URL).toBeUndefined();
    expect(env.DEEPSEEK_VISION_BASE_URL_PRIMARY).toBeUndefined();
    expect(env.DEEPSEEK_VISION_BASE_URL_FALLBACK).toBeUndefined();
  });

  it("accepts empty string as unconfigured", () => {
    const env = ok({
      DEEPSEEK_BASE_URL: "",
      DEEPSEEK_VISION_BASE_URL_PRIMARY: "",
      DEEPSEEK_VISION_BASE_URL_FALLBACK: "",
    });
    expect(env.DEEPSEEK_BASE_URL).toBeUndefined();
    expect(env.DEEPSEEK_VISION_BASE_URL_PRIMARY).toBeUndefined();
    expect(env.DEEPSEEK_VISION_BASE_URL_FALLBACK).toBeUndefined();
  });

  it("accepts HTTPS URLs", () => {
    const env = ok({
      DEEPSEEK_BASE_URL: "https://api.deepseek.com",
      DEEPSEEK_VISION_BASE_URL_PRIMARY: "https://vision1.example.com",
      DEEPSEEK_VISION_BASE_URL_FALLBACK: "https://vision2.example.com",
    });
    expect(env.DEEPSEEK_BASE_URL).toBe("https://api.deepseek.com");
  });

  it("rejects plain HTTP URLs", () => {
    fails({ DEEPSEEK_BASE_URL: "http://api.deepseek.com" });
    fails({ DEEPSEEK_VISION_BASE_URL_PRIMARY: "http://vision.example.com" });
    fails({ DEEPSEEK_VISION_BASE_URL_FALLBACK: "http://vision2.example.com" });
  });

  it("accepts HTTP localhost in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const env = ok({
      DEEPSEEK_BASE_URL: "http://localhost:8080/v1",
      DEEPSEEK_VISION_BASE_URL_PRIMARY: "http://localhost:9090",
      DEEPSEEK_VISION_BASE_URL_FALLBACK: "http://127.0.0.1:9091",
    });
    expect(env.DEEPSEEK_BASE_URL).toBe("http://localhost:8080/v1");
    expect(env.DEEPSEEK_VISION_BASE_URL_PRIMARY).toBe("http://localhost:9090");
  });

  it("rejects HTTP localhost in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    fails({ DEEPSEEK_BASE_URL: "http://localhost:8080/v1" });
    fails({ DEEPSEEK_VISION_BASE_URL_PRIMARY: "http://localhost:9090" });
  });

  it("rejects malformed URL", () => {
    fails({ DEEPSEEK_BASE_URL: "not-a-url" });
    fails({ DEEPSEEK_VISION_BASE_URL_PRIMARY: "ftp://example.com" }); // must be http/https
  });

  it("treats empty DEEPSEEK_API_KEY as unconfigured", () => {
    vi.stubGlobal("window", undefined);
    setEnv({ ...MIN_VARS, DEEPSEEK_BASE_URL: "https://api.deepseek.com", DEEPSEEK_API_KEY: "" });
    // Empty string is preprocessed to undefined — app starts; AI calls fail-closed
    const env = getServerEnv();
    expect(env.DEEPSEEK_API_KEY).toBeUndefined();
  });

  it("accepts missing DEEPSEEK_API_KEY", () => {
    const env = ok({ DEEPSEEK_BASE_URL: "https://api.deepseek.com" });
    expect(env.DEEPSEEK_API_KEY).toBeUndefined();
  });

  it("public env never exposes AI keys", () => {
    setEnv({ ...VALID_PUBLIC_ENV, DEEPSEEK_API_KEY: "sk-secret" });
    const keys = Object.keys(getPublicEnv());
    expect(keys).not.toContain("DEEPSEEK_API_KEY");
    expect(keys).not.toContain("DEEPSEEK_BASE_URL");
    expect(keys).not.toContain("DEEPSEEK_VISION_BASE_URL_PRIMARY");
  });
});
