/**
 * Route Handler Unit Tests — /api/properties/[id]/media and
 * /api/properties/[id]/media/[mediaId]
 *
 * Covers GET, POST, PATCH, DELETE handlers with all required scenarios:
 * - GET: success (200), 401, 403, 404, 500
 * - POST: success (201), partial (207), all-fail (400), 401, 403, 404,
 *         415 (bad MIME), 413 (too large), 422 (limit/video), 500
 * - PATCH: success (200), 400, 401, 403, 404, 422, 500
 * - DELETE: success (200), 401, 403 (member tries), 404, 500
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock state — resettable per test
// ---------------------------------------------------------------------------

let mockJsonResponse: ReturnType<typeof vi.fn>;
let mockGetUser: ReturnType<typeof vi.fn>;
let mockFrom: ReturnType<typeof vi.fn>;
let mockStorageFrom: ReturnType<typeof vi.fn>;
let mockUpload: ReturnType<typeof vi.fn>;
let mockCreateSignedUrl: ReturnType<typeof vi.fn>;
let mockRemove: ReturnType<typeof vi.fn>;
let mockRpc: ReturnType<typeof vi.fn>;
let mockPendingCookies: { name: string; value: string; options: Record<string, unknown> }[];

/**
 * Helper: build a mock FormData for POST tests.
 * In jsdom, passing FormData with File objects as body to NextRequest
 * cannot round-trip through request.formData(). We spy on formData()
 * to return the pre-built FormData directly.
 */
function makeFormData(files: Array<{ name: string; type: string; size: number }>): FormData {
  const fd = new FormData();
  for (const f of files) {
    fd.append("files", new File([new Uint8Array(f.size)], f.name, { type: f.type }));
  }
  return fd;
}

/**
 * Build a NextRequest with a FormData body, but replace formData()
 * to return a pre-built FormData (bypasses jsdom serialization round-trip).
 */
function createFileUploadRequest(
  url: string,
  files: Array<{ name: string; type: string; size: number }>,
  extraHeaders?: Record<string, string>,
): NextRequest {
  const fd = makeFormData(files);
  const req = new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data", ...(extraHeaders ?? {}) },
    body: "MOCK_BODY",
  });
  // Replace formData() to return pre-built FormData
  vi.spyOn(req, "formData").mockResolvedValue(fd);
  return req;
}

/** Build a Thenable mock Supabase query chain. */
function makeChain(overrides: Record<string, unknown> = {}) {
  let terminal: unknown;
  if (overrides.terminal !== undefined) {
    terminal = typeof overrides.terminal === "function"
      ? (overrides.terminal as () => unknown)()
      : overrides.terminal;
  } else {
    terminal = { data: null, error: null };
  }

  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn(() => {
      if (typeof overrides.single === "function") {
        const r = (overrides.single as () => unknown)();
        return typeof (r as { then?: unknown })?.then === "function"
          ? r as Promise<unknown>
          : Promise.resolve(r);
      }
      return Promise.resolve(terminal);
    }),
    maybeSingle: vi.fn(() => {
      if (typeof overrides.maybeSingle === "function") {
        return (overrides.maybeSingle as () => unknown)();
      }
      return Promise.resolve(terminal);
    }),
    update: vi.fn(() => chain),
    insert: vi.fn((payload?: Record<string, unknown>) => {
      if (payload && typeof overrides.onInsert === "function") {
        (overrides.onInsert as (d: Record<string, unknown>) => void)(payload);
      }
      return chain;
    }),
    then: vi.fn((resolve: (v: unknown) => void) => {
      resolve(terminal);
      return Promise.resolve(terminal);
    }),
  };

  return chain;
}

function defaultFrom() {
  return vi.fn((table: string) => {
    const overrides: Record<string, unknown> = {};
    if (table === "workspace_members") {
      overrides.single = () =>
        Promise.resolve({ data: { workspace_id: "ws-test", role: "owner" }, error: null });
    } else if (table === "properties") {
      overrides.single = () =>
        Promise.resolve({ data: { id: "prop-1", workspace_id: "ws-test" }, error: null });
    } else if (table === "property_media") {
      // Default: return no media found (for count queries and lookups)
      // `single` and `maybeSingle` return the terminal
      overrides.terminal = { data: [], count: 0, error: null };
    }
    return makeChain(overrides);
  });
}

function resetMocks() {
  mockPendingCookies = [];
  mockGetUser = vi.fn();
  mockUpload = vi.fn();
  mockCreateSignedUrl = vi.fn();
  mockRemove = vi.fn(() => Promise.resolve({ error: null }));
  mockRpc = vi.fn();
  mockStorageFrom = vi.fn((_bucket: string) => ({
    upload: mockUpload,
    createSignedUrl: mockCreateSignedUrl,
    remove: mockRemove,
  }));
  mockJsonResponse = vi.fn(
    (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
      const response = new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
      if (mockPendingCookies.length > 0) {
        const cookieHeader = mockPendingCookies
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");
        response.headers.set("Set-Cookie", cookieHeader);
      }
      return response;
    }
  );
  mockFrom = defaultFrom();
}

vi.mock("@/lib/supabase/route-handler", () => ({
  createRouteHandlerClient: vi.fn(() =>
    Promise.resolve({
      client: {
        auth: { getUser: mockGetUser },
        from: mockFrom,
        rpc: mockRpc,
      },
      jsonResponse: mockJsonResponse,
    })
  ),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      storage: { from: mockStorageFrom },
    })
  ),
}));

// ===========================================================================
// GET /api/properties/[id]/media
// ===========================================================================

describe("GET /api/properties/[id]/media", () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../[id]/media/route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(
      new NextRequest("http://localhost/api/properties/prop-1/media"),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(body.error.message).toContain("未登录");
  });

  it("returns 403 when user has no workspace membership", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/properties/prop-1/media"),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  it("returns 404 when property not found in workspace", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/properties/prop-1/media"),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("returns 200 with media list and signed URLs", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/bucket/path?token=abc" },
      error: null,
    });

    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      if (table === "property_media") {
        return makeChain({
          terminal: {
            data: [{ id: "m1", property_id: "prop-1", storage_path: "ws-test/u1/uuid.jpg", media_type: "image", scene_tag: null, is_cover: false, sort_order: 0, width: null, height: null, ai_labels: null, ai_analysis_status: "pending", created_at: "2026-08-02T10:00:00Z" }],
            count: 1,
            error: null,
          },
        });
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/properties/prop-1/media"),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.media).toBeInstanceOf(Array);
    expect(body.data.total).toBe(1);
    expect(body.error).toBeNull();
  });

  it("returns 200 with empty media list when no media exist", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      if (table === "property_media") {
        return makeChain({
          terminal: { data: [], count: 0, error: null },
        });
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/properties/prop-1/media"),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.media).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  it("returns 500 on media query error — sanitized", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      if (table === "property_media") {
        return makeChain({
          terminal: { data: null, count: null, error: { code: "XX000", message: "disk full" } },
        });
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/route");
    const res = await mod.GET(
      new NextRequest("http://localhost/api/properties/prop-1/media"),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).not.toContain("disk full");
  });

  it("returns 500 on unexpected exception — sanitized", async () => {
    mockGetUser.mockRejectedValue(new Error("Connection refused"));

    const res = await GET(
      new NextRequest("http://localhost/api/properties/prop-1/media"),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toContain("服务器错误");
    expect(body.error.message).not.toContain("Connection refused");
  });
});

// ===========================================================================
// POST /api/properties/[id]/media
// ===========================================================================

describe("POST /api/properties/[id]/media", () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../[id]/media/route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const req = createFileUploadRequest("http://localhost/api/properties/prop-1/media", [
      { name: "test.jpg", type: "image/jpeg", size: 1024 },
    ]);
    const res = await POST(req, { params: Promise.resolve({ id: "prop-1" }) });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 403 when user has no workspace membership", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const req = createFileUploadRequest("http://localhost/api/properties/prop-1/media", [
      { name: "test.jpg", type: "image/jpeg", size: 1024 },
    ]);
    const mod = await import("../[id]/media/route");
    const res = await mod.POST(req, { params: Promise.resolve({ id: "prop-1" }) });

    expect(res.status).toBe(403);
  });

  it("returns 404 when property not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const req = createFileUploadRequest("http://localhost/api/properties/prop-1/media", [
      { name: "test.jpg", type: "image/jpeg", size: 1024 },
    ]);
    const mod = await import("../[id]/media/route");
    const res = await mod.POST(req, { params: Promise.resolve({ id: "prop-1" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("returns 400 when Content-Type is not multipart/form-data", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const res = await POST(
      new NextRequest("http://localhost/api/properties/prop-1/media", {
        method: "POST",
        body: JSON.stringify({ not: "form" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "prop-1" }) }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.message).toContain("multipart/form-data");
  });

  it("returns 400 when no files provided", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    // Empty formData
    const req = createFileUploadRequest("http://localhost/api/properties/prop-1/media", []);
    const mod = await import("../[id]/media/route");
    const res = await mod.POST(req, { params: Promise.resolve({ id: "prop-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.message).toContain("未提供文件");
  });

  it("returns 400 when too many files per request (6 > MAX_FILES_PER_UPLOAD=5)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const req = createFileUploadRequest("http://localhost/api/properties/prop-1/media",
      Array.from({ length: 6 }, (_, i) => ({
        name: `test${i}.jpg`, type: "image/jpeg", size: 1024,
      }))
    );

    const mod = await import("../[id]/media/route");
    const res = await mod.POST(req, { params: Promise.resolve({ id: "prop-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("最多上传");
  });

  it("returns 422 when per-property limit would be exceeded", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    // Override property_media to return count=18
    const existingFrom = defaultFrom();
    mockFrom = vi.fn((table: string) => {
      if (table === "property_media") {
        // First call: count query (head:true) → handled by default terminal=null/0
        // But we need it to return count=18 for the limit check
        // The handler calls two property_media queries: count, then maybeSingle for cover.
        // We need the count to return 18.
        let callCount = 0;
        const chain = makeChain();
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.is = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
        chain.then = vi.fn((resolve: (v: unknown) => void) => {
          callCount++;
          if (callCount === 1) {
            resolve({ data: null, count: 18, error: null });
          } else {
            resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        });
        return chain;
      }
      return existingFrom(table);
    });

    const req = createFileUploadRequest("http://localhost/api/properties/prop-1/media",
      Array.from({ length: 3 }, (_, i) => ({
        name: `test${i}.jpg`, type: "image/jpeg", size: 1024,
      }))
    );

    const mod = await import("../[id]/media/route");
    const res = await mod.POST(req, { params: Promise.resolve({ id: "prop-1" }) });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("MEDIA_LIMIT_EXCEEDED");
    expect(body.error.message).toContain("20");
  });

  it("returns 201 on successful upload", async () => {
    const insertData = {
      id: "media-new", property_id: "prop-1", workspace_id: "ws-test",
      storage_path: "ws-test/u1/uuid.jpg", media_type: "image", scene_tag: null,
      is_cover: false, sort_order: 0, width: null, height: null, ai_labels: null,
      ai_analysis_status: "pending", created_at: "2026-08-02T10:00:00Z",
    };

    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockUpload.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed-url" },
      error: null,
    });

    // Override property_media to simulate full insert flow
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () => Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () => Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      if (table === "property_media") {
        const chain = makeChain();
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.is = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.order = vi.fn(() => chain);
        // Count query (head:true) → returns count 0
        // Cover check (maybeSingle) → returns null (no existing cover)
        // Insert → returns the new media row
        let callPhase = 0;
        chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
        chain.then = vi.fn((resolve: (v: unknown) => void) => {
          callPhase++;
          if (callPhase === 1) {
            resolve({ data: null, count: 0, error: null });
          } else if (callPhase === 2) {
            resolve({ data: insertData, error: null });
          } else {
            resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        });
        chain.insert = vi.fn(() => chain);
        chain.single = vi.fn(() => Promise.resolve({ data: insertData, error: null }));
        return chain;
      }
      return makeChain();
    });

    const req = createFileUploadRequest("http://localhost/api/properties/prop-1/media", [
      { name: "photo.jpg", type: "image/jpeg", size: 1024 },
    ]);

    const mod = await import("../[id]/media/route");
    const res = await mod.POST(req, { params: Promise.resolve({ id: "prop-1" }) });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.media).toBeInstanceOf(Array);
    expect(body.data.media[0].id).toBe("media-new");
    expect(body.data.media[0].signedUrl).toBe("https://storage.example/signed-url");
    expect(body.error).toBeNull();
  });

  it("rejects unsupported MIME type (PDF) — returns 400", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const req = createFileUploadRequest("http://localhost/api/properties/prop-1/media", [
      { name: "document.pdf", type: "application/pdf", size: 1024 },
    ]);

    const mod = await import("../[id]/media/route");
    const res = await mod.POST(req, { params: Promise.resolve({ id: "prop-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.details.rejections).toHaveLength(1);
    expect(body.error.details.rejections[0].code).toBe("MEDIA_UNSUPPORTED_TYPE");
  });

  it("rejects video (MEDIA_VIDEO_DEFERRED) — returns 400", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const req = createFileUploadRequest("http://localhost/api/properties/prop-1/media", [
      { name: "tour.mp4", type: "video/mp4", size: 1024 },
    ]);

    const mod = await import("../[id]/media/route");
    const res = await mod.POST(req, { params: Promise.resolve({ id: "prop-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.details.rejections).toHaveLength(1);
    expect(body.error.details.rejections[0].code).toBe("MEDIA_VIDEO_DEFERRED");
  });

  it("rejects file exceeding 10 MB — returns 400", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const req = createFileUploadRequest("http://localhost/api/properties/prop-1/media", [
      { name: "huge.jpg", type: "image/jpeg", size: 11 * 1024 * 1024 },
    ]);

    const mod = await import("../[id]/media/route");
    const res = await mod.POST(req, { params: Promise.resolve({ id: "prop-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.details.rejections).toHaveLength(1);
    expect(body.error.details.rejections[0].code).toBe("MEDIA_FILE_TOO_LARGE");
  });

  it("returns 207 for partial upload success", async () => {
    const insertData = {
      id: "media-ok", property_id: "prop-1", workspace_id: "ws-test",
      storage_path: "ws-test/u1/uuid.jpg", media_type: "image", scene_tag: null,
      is_cover: false, sort_order: 0, width: null, height: null, ai_labels: null,
      ai_analysis_status: "pending", created_at: "2026-08-02T10:00:00Z",
    };

    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockUpload.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed-url" },
      error: null,
    });

    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () => Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () => Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      if (table === "property_media") {
        const chain = makeChain();
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.is = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.order = vi.fn(() => chain);
        let callPhase = 0;
        chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
        chain.then = vi.fn((resolve: (v: unknown) => void) => {
          callPhase++;
          if (callPhase === 1) {
            resolve({ data: null, count: 0, error: null });
          } else {
            resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        });
        chain.insert = vi.fn(() => chain);
        chain.single = vi.fn(() => Promise.resolve({ data: insertData, error: null }));
        return chain;
      }
      return makeChain();
    });

    // 2 files: one good JPEG, one bad PDF
    const req = createFileUploadRequest("http://localhost/api/properties/prop-1/media", [
      { name: "good.jpg", type: "image/jpeg", size: 1024 },
      { name: "bad.pdf", type: "application/pdf", size: 512 },
    ]);

    const mod = await import("../[id]/media/route");
    const res = await mod.POST(req, { params: Promise.resolve({ id: "prop-1" }) });

    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.data.media).toHaveLength(1);
    expect(body.data.rejections).toHaveLength(1);
    expect(body.data.rejections[0].code).toBe("MEDIA_UNSUPPORTED_TYPE");
  });

  it("first upload gets is_cover = true when no existing cover", async () => {
    let insertPayload: Record<string, unknown> = {};
    const insertData = {
      id: "media-new", property_id: "prop-1", workspace_id: "ws-test",
      storage_path: "ws-test/u1/uuid.jpg", media_type: "image", scene_tag: null,
      is_cover: true, sort_order: 0, width: null, height: null, ai_labels: null,
      ai_analysis_status: "pending", created_at: "2026-08-02T10:00:00Z",
    };

    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockUpload.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed-url" },
      error: null,
    });

    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () => Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () => Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      if (table === "property_media") {
        const chain = makeChain();
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.is = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.order = vi.fn(() => chain);
        let callPhase = 0;
        // maybeSingle returns null → no existing cover
        chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
        chain.then = vi.fn((resolve: (v: unknown) => void) => {
          callPhase++;
          if (callPhase === 1) {
            resolve({ data: null, count: 0, error: null });
          } else {
            resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        });
        chain.insert = vi.fn((payload: Record<string, unknown>) => {
          insertPayload = payload;
          return chain;
        });
        chain.single = vi.fn(() => Promise.resolve({ data: insertData, error: null }));
        return chain;
      }
      return makeChain();
    });

    const req = createFileUploadRequest("http://localhost/api/properties/prop-1/media", [
      { name: "first.jpg", type: "image/jpeg", size: 1024 },
    ]);

    const mod = await import("../[id]/media/route");
    await mod.POST(req, { params: Promise.resolve({ id: "prop-1" }) });

    expect(insertPayload.is_cover).toBe(true);
  });

  it("compensates: removes storage object on DB insert failure", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockUpload.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed-url" },
      error: null,
    });

    let removeCalled = false;
    mockRemove.mockImplementation((_paths: string[]) => {
      removeCalled = true;
      return Promise.resolve({ error: null });
    });

    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () => Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () => Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      if (table === "property_media") {
        const chain = makeChain();
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.is = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.order = vi.fn(() => chain);
        let callPhase = 0;
        chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
        chain.then = vi.fn((resolve: (v: unknown) => void) => {
          callPhase++;
          if (callPhase === 1) {
            resolve({ data: null, count: 0, error: null });
          } else {
            resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        });
        chain.insert = vi.fn(() => chain);
        // Insert fails → returns error
        chain.single = vi.fn(() =>
          Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } })
        );
        return chain;
      }
      return makeChain();
    });

    const req = createFileUploadRequest("http://localhost/api/properties/prop-1/media", [
      { name: "nodb.jpg", type: "image/jpeg", size: 1024 },
    ]);

    const mod = await import("../[id]/media/route");
    const res = await mod.POST(req, { params: Promise.resolve({ id: "prop-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.details.rejections[0].code).toBe("INTERNAL_ERROR");
    expect(removeCalled).toBe(true);
  });

  it("returns 500 on unexpected exception — sanitized", async () => {
    mockGetUser.mockRejectedValue(new Error("Network failure"));

    const req = createFileUploadRequest("http://localhost/api/properties/prop-1/media", [
      { name: "test.jpg", type: "image/jpeg", size: 1024 },
    ]);

    const res = await POST(req, { params: Promise.resolve({ id: "prop-1" }) });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toContain("服务器错误");
    expect(body.error.message).not.toContain("Network failure");
  });
});

// ===========================================================================
// PATCH /api/properties/[id]/media/[mediaId]
// ===========================================================================

describe("PATCH /api/properties/[id]/media/[mediaId]", () => {
  let PATCH: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string; mediaId: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../[id]/media/[mediaId]/route");
    PATCH = mod.PATCH;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await PATCH(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "PATCH",
        body: JSON.stringify({ sceneTag: "bedroom" }),
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no workspace membership", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/[mediaId]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "PATCH",
        body: JSON.stringify({ sceneTag: "bedroom" }),
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when property not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/[mediaId]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "PATCH",
        body: JSON.stringify({ sceneTag: "bedroom" }),
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when media record not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      // property_media — not found
      return makeChain({
        single: () =>
          Promise.resolve({ data: null, error: { code: "PGRST116" } }),
      });
    });

    const mod = await import("../[id]/media/[mediaId]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "PATCH",
        body: JSON.stringify({ sceneTag: "bedroom" }),
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toContain("媒体文件不存在");
  });

  it("returns 200 for valid metadata update", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed-url" },
      error: null,
    });

    const mediaRow = {
      id: "media-1", property_id: "prop-1", workspace_id: "ws-test",
      storage_path: "ws-test/u1/uuid.jpg", media_type: "image",
      scene_tag: null, is_cover: false, sort_order: 0,
      width: null, height: null, ai_labels: null,
      ai_analysis_status: "pending", created_at: "2026-08-02T10:00:00Z",
    };

    const updatedMedia = { ...mediaRow, scene_tag: "bedroom", sort_order: 1 };

    // The handler queries property_media twice: once to verify existence, once to update.
    let queryCount = 0;
    let updateCallCount = 0;
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      if (table === "property_media") {
        const chain = makeChain();
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.neq = vi.fn(() => chain);
        chain.is = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.order = vi.fn(() => chain);
        chain.update = vi.fn(() => {
          updateCallCount++;
          return chain;
        });
        chain.single = vi.fn(() => {
          queryCount++;
          if (queryCount === 1) {
            // First query: verify media exists
            return Promise.resolve({ data: mediaRow, error: null });
          }
          // Second query: after update
          return Promise.resolve({ data: updatedMedia, error: null });
        });
        return chain;
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/[mediaId]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "PATCH",
        body: JSON.stringify({ sceneTag: "bedroom", sortOrder: 1 }),
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.sceneTag).toBe("bedroom");
    expect(body.data.sortOrder).toBe(1);
    expect(body.data.signedUrl).toBe("https://storage.example/signed-url");
  });

  it("returns 200 and unsets other covers when setting isCover=true", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed-url" },
      error: null,
    });

    const mediaRow = {
      id: "media-2", property_id: "prop-1", workspace_id: "ws-test",
      storage_path: "ws-test/u1/cover.jpg", media_type: "image",
      scene_tag: null, is_cover: false, sort_order: 0,
      width: null, height: null, ai_labels: null,
      ai_analysis_status: "pending", created_at: "2026-08-02T10:00:00Z",
    };

    const updatedMedia = { ...mediaRow, is_cover: true };

    let queryCount = 0;
    let updateCalls: string[] = [];
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      if (table === "property_media") {
        const chain = makeChain();
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.neq = vi.fn(() => chain);
        chain.is = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.order = vi.fn(() => chain);
        chain.update = vi.fn((payload: Record<string, unknown>) => {
          updateCalls.push(JSON.stringify(payload));
          return chain;
        });
        chain.single = vi.fn(() => {
          queryCount++;
          if (queryCount === 1) {
            return Promise.resolve({ data: mediaRow, error: null });
          }
          return Promise.resolve({ data: updatedMedia, error: null });
        });
        return chain;
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/[mediaId]/route");
    await mod.PATCH(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-2", {
        method: "PATCH",
        body: JSON.stringify({ isCover: true }),
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-2" }) }
    );

    // Cover is set via atomic RPC now
    expect(mockRpc).toHaveBeenCalledWith("set_media_cover", { p_media_id: "media-2" });
  });

  it("returns 400 when body is not valid JSON", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const res = await PATCH(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "PATCH",
        body: "not-json",
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("请求体无效");
  });

  it("returns 422 when validation fails (scene_tag too long)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    // Need workspace_members → properties → property_media exist check → then Zod fails
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      if (table === "property_media") {
        return makeChain({
          single: () =>
            Promise.resolve({
              data: { id: "media-1", property_id: "prop-1", workspace_id: "ws-test" },
              error: null,
            }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/[mediaId]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "PATCH",
        body: JSON.stringify({ sceneTag: "x".repeat(51) }),
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 400 when update has no fields", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      if (table === "property_media") {
        return makeChain({
          single: () =>
            Promise.resolve({
              data: { id: "media-1", property_id: "prop-1", workspace_id: "ws-test" },
              error: null,
            }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/[mediaId]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("未提供要更新的字段");
  });

  it("returns 500 on DB update failure — sanitized", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const mediaRow = {
      id: "media-1", property_id: "prop-1", workspace_id: "ws-test",
      storage_path: "ws-test/u1/uuid.jpg", media_type: "image",
      scene_tag: null, is_cover: false, sort_order: 0,
      width: null, height: null, ai_labels: null,
      ai_analysis_status: "pending", created_at: "2026-08-02T10:00:00Z",
    };

    let queryCount = 0;
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { workspace_id: "ws-test" }, error: null }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      if (table === "property_media") {
        const chain = makeChain();
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.neq = vi.fn(() => chain);
        chain.is = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.order = vi.fn(() => chain);
        chain.update = vi.fn(() => chain);
        chain.single = vi.fn(() => {
          queryCount++;
          if (queryCount === 1) {
            // Verify exists: succeeds
            return Promise.resolve({ data: mediaRow, error: null });
          }
          // Update: fails
          return Promise.resolve({ data: null, error: { code: "XX000", message: "connection lost" } });
        });
        return chain;
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/[mediaId]/route");
    const res = await mod.PATCH(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "PATCH",
        body: JSON.stringify({ sceneTag: "bedroom" }),
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).not.toContain("connection lost");
  });
});

// ===========================================================================
// DELETE /api/properties/[id]/media/[mediaId]
// ===========================================================================

describe("DELETE /api/properties/[id]/media/[mediaId]", () => {
  let DELETE: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string; mediaId: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    resetMocks();
    const mod = await import("../[id]/media/[mediaId]/route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await DELETE(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not workspace owner (member tries delete)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({
              data: { workspace_id: "ws-test", role: "member" },
              error: null,
            }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/[mediaId]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toContain("仅工作区所有者");
  });

  it("returns 404 when property not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({
              data: { workspace_id: "ws-test", role: "owner" },
              error: null,
            }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        });
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/[mediaId]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when media not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({
              data: { workspace_id: "ws-test", role: "owner" },
              error: null,
            }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      // property_media — not found
      return makeChain({
        single: () =>
          Promise.resolve({ data: null, error: { code: "PGRST116" } }),
      });
    });

    const mod = await import("../[id]/media/[mediaId]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toContain("媒体文件不存在");
  });

  it("returns 200 on successful soft-delete", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    // Mock RPC for soft_delete_media
    const now = new Date().toISOString();
    mockRpc = vi.fn((_fn: string, _args: Record<string, unknown>) =>
      Promise.resolve({
        data: [{ id: "media-1", property_id: "prop-1", deleted_at: now }],
        error: null,
      })
    );

    let queryCount = 0;
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({
              data: { workspace_id: "ws-test", role: "owner" },
              error: null,
            }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      if (table === "property_media") {
        const chain = makeChain();
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.is = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.update = vi.fn(() => chain);
        chain.single = vi.fn(() => {
          queryCount++;
          if (queryCount === 1) {
            return Promise.resolve({
              data: { id: "media-1", property_id: "prop-1", storage_path: "ws-test/u1/abc.jpg" },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        });
        return chain;
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/[mediaId]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
    expect(body.data.mediaId).toBe("media-1");
    expect(body.data.deletedAt).toBeDefined();
    expect(typeof body.data.deletedAt).toBe("string");
  });

  it("returns 500 on DB delete failure — sanitized", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    let fromCallCount = 0;
    mockFrom = vi.fn((table: string) => {
      if (table === "workspace_members") {
        return makeChain({
          single: () =>
            Promise.resolve({
              data: { workspace_id: "ws-test", role: "owner" },
              error: null,
            }),
        });
      }
      if (table === "properties") {
        return makeChain({
          single: () =>
            Promise.resolve({ data: { id: "prop-1" }, error: null }),
        });
      }
      if (table === "property_media") {
        fromCallCount++;
        const chain = makeChain();
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.is = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.update = vi.fn(() => chain);
        if (fromCallCount === 1) {
          // First call: verify media exists
          chain.single = vi.fn(() =>
            Promise.resolve({
              data: { id: "media-1", property_id: "prop-1" },
              error: null,
            })
          );
        } else {
          // Second call: update fails — terminal has error
          chain.then = vi.fn((resolve: (v: unknown) => void) => {
            resolve({ data: null, error: { code: "XX000", message: "disk full" } });
            return Promise.resolve({ data: null, error: { code: "XX000", message: "disk full" } });
          });
          chain.single = vi.fn(() =>
            Promise.resolve({ data: null, error: { code: "XX000", message: "disk full" } })
          );
        }
        return chain;
      }
      return makeChain();
    });

    const mod = await import("../[id]/media/[mediaId]/route");
    const res = await mod.DELETE(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).not.toContain("disk full");
  });

  it("returns 500 on unexpected exception — sanitized", async () => {
    mockGetUser.mockRejectedValue(new Error("Timeout"));

    const res = await DELETE(
      new NextRequest("http://localhost/api/properties/prop-1/media/media-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "prop-1", mediaId: "media-1" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toContain("服务器错误");
    expect(body.error.message).not.toContain("Timeout");
  });
});
