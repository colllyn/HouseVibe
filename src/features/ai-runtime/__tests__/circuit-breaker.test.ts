// ============================================================
// Circuit Breaker Unit Tests — P3-AI-015
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveModelEndpoint,
  healthCheck,
  isServerError,
  isNonServerError,
} from "../circuit-breaker";
import type { CircuitState } from "../circuit-breaker";

// ============================================================
// Mock env
// ============================================================

vi.mock("@/config/env", () => ({
  getServerEnv: () => ({
    DEEPSEEK_MODEL: "deepseek-v4-flash",
    DEEPSEEK_FALLBACK_MODEL: "deepseek-v3",
    DEEPSEEK_BASE_URL: "https://api.deepseek.com",
    DEEPSEEK_API_KEY: "sk-test-key",
    DEEPSEEK_VISION_MODEL: "deepseek-vl2",
    DEEPSEEK_VISION_BASE_URL_PRIMARY: "https://vision-primary.example.com",
    DEEPSEEK_VISION_BASE_URL_FALLBACK: "https://vision-fallback.example.com",
    DEEPSEEK_VISION_API_KEY: "sk-vision-key",
  }),
}));

// ============================================================
// Helpers
// ============================================================

function makeConfig(overrides: Partial<CircuitState> = {}): CircuitState {
  return {
    circuitOpen: false,
    mode: "auto",
    consecutiveFailures: 0,
    ...overrides,
  };
}

// ============================================================
// resolveModelEndpoint
// ============================================================

describe("resolveModelEndpoint", () => {
  describe("text capability", () => {
    it("returns primary model in auto mode with closed circuit", () => {
      const ep = resolveModelEndpoint("text", makeConfig());
      expect(ep.model).toBe("deepseek-v4-flash");
      expect(ep.baseUrl).toBe("https://api.deepseek.com");
      expect(ep.apiKey).toBe("sk-test-key");
    });

    it("returns primary model when forced to primary", () => {
      const ep = resolveModelEndpoint("text", makeConfig({ mode: "primary", circuitOpen: true }));
      expect(ep.model).toBe("deepseek-v4-flash");
    });

    it("returns fallback model when forced to fallback", () => {
      const ep = resolveModelEndpoint("text", makeConfig({ mode: "fallback" }));
      expect(ep.model).toBe("deepseek-v3");
    });

    it("returns fallback model when circuit is open in auto mode", () => {
      const ep = resolveModelEndpoint("text", makeConfig({ circuitOpen: true }));
      expect(ep.model).toBe("deepseek-v3");
    });
  });

  describe("vision capability", () => {
    it("returns primary vision endpoint in auto mode with closed circuit", () => {
      const ep = resolveModelEndpoint("vision", makeConfig());
      expect(ep.model).toBe("deepseek-vl2");
      expect(ep.baseUrl).toBe("https://vision-primary.example.com");
      expect(ep.apiKey).toBe("sk-vision-key");
    });

    it("returns fallback vision endpoint when circuit is open", () => {
      const ep = resolveModelEndpoint("vision", makeConfig({ circuitOpen: true }));
      expect(ep.model).toBe("deepseek-vl2"); // same model
      expect(ep.baseUrl).toBe("https://vision-fallback.example.com");
    });

    it("returns fallback vision endpoint when forced to fallback", () => {
      const ep = resolveModelEndpoint("vision", makeConfig({ mode: "fallback" }));
      expect(ep.baseUrl).toBe("https://vision-fallback.example.com");
    });

    it("returns primary vision endpoint when forced to primary regardless of circuit", () => {
      const ep = resolveModelEndpoint("vision", makeConfig({ mode: "primary", circuitOpen: true }));
      expect(ep.baseUrl).toBe("https://vision-primary.example.com");
    });
  });

  describe("circuit closed → stays on primary", () => {
    it("text: uses primary when circuit is closed in auto mode", () => {
      const ep = resolveModelEndpoint("text", makeConfig({ circuitOpen: false, mode: "auto" }));
      expect(ep.model).toBe("deepseek-v4-flash");
    });

    it("vision: uses primary when circuit is closed in auto mode", () => {
      const ep = resolveModelEndpoint("vision", makeConfig({ circuitOpen: false, mode: "auto" }));
      expect(ep.baseUrl).toBe("https://vision-primary.example.com");
    });
  });

  describe("circuit open → switches to fallback", () => {
    it("text: uses fallback when circuit is open", () => {
      const ep = resolveModelEndpoint("text", makeConfig({ circuitOpen: true, mode: "auto" }));
      expect(ep.model).toBe("deepseek-v3");
    });

    it("vision: uses fallback endpoint when circuit is open", () => {
      const ep = resolveModelEndpoint("vision", makeConfig({ circuitOpen: true, mode: "auto" }));
      expect(ep.baseUrl).toBe("https://vision-fallback.example.com");
    });
  });
});

// ============================================================
// healthCheck
// ============================================================

describe("healthCheck", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when endpoint responds successfully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    );
    const ok = await healthCheck({ baseUrl: "https://api.example.com", apiKey: "k", model: "m" });
    expect(ok).toBe(true);
  });

  it("returns true even on 4xx (endpoint is reachable)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("{}", { status: 401 }),
    );
    const ok = await healthCheck({ baseUrl: "https://api.example.com", apiKey: "k", model: "m" });
    expect(ok).toBe(true);
  });

  it("returns false on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const ok = await healthCheck({ baseUrl: "https://api.example.com", apiKey: "k", model: "m" });
    expect(ok).toBe(false);
  });

  it("returns false on timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(() =>
      new Promise((_, reject) => setTimeout(() => reject(new Error("ETIMEDOUT")), 500)),
    );
    const ok = await healthCheck({ baseUrl: "https://api.example.com", apiKey: "k", model: "m" }, 50);
    expect(ok).toBe(false);
  });
});

// ============================================================
// isServerError / isNonServerError
// ============================================================

describe("isServerError", () => {
  it("returns true for 5xx status", () => {
    expect(isServerError(500)).toBe(true);
    expect(isServerError(502)).toBe(true);
    expect(isServerError(503)).toBe(true);
    expect(isServerError(504)).toBe(true);
  });

  it("returns true for connection errors", () => {
    expect(isServerError(undefined, "ECONNREFUSED")).toBe(true);
    expect(isServerError(undefined, "ECONNRESET")).toBe(true);
    expect(isServerError(undefined, "ETIMEDOUT")).toBe(true);
    expect(isServerError(undefined, "ABORT_ERR")).toBe(true);
    expect(isServerError(undefined, "FETCH_ERROR")).toBe(true);
  });

  it("returns false for 4xx status", () => {
    expect(isServerError(400)).toBe(false);
    expect(isServerError(401)).toBe(false);
    expect(isServerError(403)).toBe(false);
    expect(isServerError(404)).toBe(false);
    expect(isServerError(429)).toBe(false);
  });

  it("returns false for no status and no error type", () => {
    expect(isServerError(undefined)).toBe(false);
  });
});

describe("isNonServerError", () => {
  it("returns true for 4xx", () => {
    expect(isNonServerError(400)).toBe(true);
    expect(isNonServerError(404)).toBe(true);
    expect(isNonServerError(429)).toBe(true);
  });

  it("returns false for 5xx", () => {
    expect(isNonServerError(500)).toBe(false);
  });

  it("returns false for undefined status", () => {
    expect(isNonServerError(undefined)).toBe(false);
  });
});
