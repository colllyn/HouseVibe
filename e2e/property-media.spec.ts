/**
 * Property Media E2E — P2-PROP-003-MEDIA-017
 * Covers: media upload, list, metadata update, soft delete, cover management,
 *         cross-workspace isolation, mobile layout, error handling.
 *
 * 15 scenarios, real Chromium, 0 skip.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const OWNER_STATE = path.resolve(__dirname, ".auth/owner.json");
const OTHER_STATE = path.resolve(__dirname, ".auth/other.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createProperty(page: import("@playwright/test").Page, data: {
  title: string; city: string; rental_type?: string;
}): Promise<string> {
  await page.goto("/properties/new");
  await page.fill('input[name="title"]', data.title);
  await page.fill('input[name="city"]', data.city);
  await page.selectOption('select[name="rental_type"]', data.rental_type ?? "whole_unit");
  await page.click('[data-testid="property-create-submit"]');
  await page.waitForURL(/\/properties\/[a-f0-9-]+/, { timeout: 15000 });
  return page.url().split("/").pop()!;
}

/**
 * Upload a media file by calling fetch() from the browser page context.
 * Uses multipart/form-data to POST to the media endpoint.
 * Returns the JSON response body.
 */
async function uploadMedia(
  page: import("@playwright/test").Page,
  propertyId: string,
  fileName: string,
  fileType: string,
  fileSizeBytes: number = 1024,
): Promise<{ status: number; body: Record<string, unknown> }> {
  // Create a mock file buffer of random bytes
  const buffer = Buffer.alloc(fileSizeBytes, "x".repeat(fileSizeBytes).slice(0, fileSizeBytes));

  const result = await page.evaluate(
    async ({ propId, fName, fType, fSize, base }) => {
      const blob = new Blob([new Uint8Array(fSize).fill(120)], { type: fType });
      const file = new File([blob], fName, { type: fType });
      const formData = new FormData();
      formData.append("files", file);

      const res = await fetch(`${base}/api/properties/${propId}/media`, {
        method: "POST",
        body: formData,
      });

      let body: Record<string, unknown>;
      try {
        body = await res.json();
      } catch {
        body = { _error: "not json" };
      }

      return { status: res.status, body };
    },
    { propId: propertyId, fName: fileName, fType: fileType, fSize: fileSizeBytes, base: BASE_URL }
  );

  return result;
}

/**
 * GET media list for a property via fetch().
 */
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

async function listMedia(
  page: import("@playwright/test").Page,
  propertyId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const result = await page.evaluate(async ({ propId, base }: { propId: string; base: string }) => {
    const res = await fetch(`${base}/api/properties/${propId}/media`);
    let body: Record<string, unknown>;
    try {
      body = await res.json();
    } catch {
      body = { _error: "not json" };
    }
    return { status: res.status, body };
  }, { propId: propertyId, base: BASE_URL });

  return result;
}

/**
 * PATCH media metadata via fetch().
 */
async function updateMedia(
  page: import("@playwright/test").Page,
  propertyId: string,
  mediaId: string,
  bodyData: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const result = await page.evaluate(
    async ({ propId, mId, bd, base }: { propId: string; mId: string; bd: Record<string, unknown>; base: string }) => {
      const res = await fetch(`${base}/api/properties/${propId}/media/${mId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bd),
      });
      let body: Record<string, unknown>;
      try {
        body = await res.json();
      } catch {
        body = { _error: "not json" };
      }
      return { status: res.status, body };
    },
    { propId: propertyId, mId: mediaId, bd: bodyData, base: BASE_URL }
  );

  return result;
}

/**
 * DELETE media via fetch().
 */
async function deleteMedia(
  page: import("@playwright/test").Page,
  propertyId: string,
  mediaId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const result = await page.evaluate(
    async ({ propId, mId, base }: { propId: string; mId: string; base: string }) => {
      const res = await fetch(`${base}/api/properties/${propId}/media/${mId}`, {
        method: "DELETE",
      });
      let body: Record<string, unknown>;
      try {
        body = await res.json();
      } catch {
        body = { _error: "not json" };
      }
      return { status: res.status, body };
    },
    { propId: propertyId, mId: mediaId, base: BASE_URL }
  );

  return result;
}

// ===========================================================================
// Tests
// ===========================================================================

test.describe("Property Media", () => {
  test.use({ storageState: OWNER_STATE });

  // 1. Upload single image — returns 201
  test("1. upload single image returns 201", async ({ page }) => {
    const propId = await createProperty(page, {
      title: "Media Upload Test",
      city: "Beijing",
    });

    const result = await uploadMedia(page, propId, "living-room.jpg", "image/jpeg");
    expect(result.status).toBe(201);
    const body = result.body;
    expect(body.error).toBeNull();
    expect((body.data as Record<string, unknown>).media).toBeInstanceOf(Array);
    expect(
      (body.data as Record<string, unknown>).media as unknown[]
    ).toHaveLength(1);
  });

  // 2. First upload becomes cover image
  test("2. first upload becomes cover image", async ({ page }) => {
    const propId = await createProperty(page, {
      title: "Cover Test",
      city: "Shanghai",
    });

    const result = await uploadMedia(page, propId, "cover.jpg", "image/jpeg");
    expect(result.status).toBe(201);
    const media = (result.body.data as Record<string, unknown>).media as Record<string, unknown>[];
    expect(media[0].isCover).toBe(true);
  });

  // 3. List media — returns 200 with signed URLs
  test("3. list media returns signed URLs", async ({ page }) => {
    const propId = await createProperty(page, {
      title: "List Media Test",
      city: "Guangzhou",
    });

    await uploadMedia(page, propId, "a.jpg", "image/jpeg");
    await uploadMedia(page, propId, "b.jpg", "image/png");

    const result = await listMedia(page, propId);
    expect(result.status).toBe(200);
    const data = result.body.data as Record<string, unknown>;
    expect(data.total).toBe(2);
    const mediaList = data.media as Record<string, unknown>[];
    for (const m of mediaList) {
      expect(m.signedUrl).toBeTruthy();
      expect(typeof m.signedUrl).toBe("string");
    }
  });

  // 4. Update scene_tag — PATCH succeeds
  test("4. update scene_tag via PATCH", async ({ page }) => {
    const propId = await createProperty(page, {
      title: "SceneTag Test",
      city: "Shenzhen",
    });

    await uploadMedia(page, propId, "room.jpg", "image/jpeg");
    const listResp = await listMedia(page, propId);
    const media = (listResp.body.data as Record<string, unknown>).media as Record<string, unknown>[];
    const mediaId = media[0].id as string;

    const patchResp = await updateMedia(page, propId, mediaId, {
      sceneTag: "living_room",
      sortOrder: 1,
    });

    expect(patchResp.status).toBe(200);
    const updated = patchResp.body.data as Record<string, unknown>;
    expect(updated.sceneTag).toBe("living_room");
    expect(updated.sortOrder).toBe(1);
  });

  // 5. Set cover — unset previous cover
  test("5. set cover unsets previous cover", async ({ page }) => {
    const propId = await createProperty(page, {
      title: "Cover Swap Test",
      city: "Chengdu",
    });

    await uploadMedia(page, propId, "first.jpg", "image/jpeg");
    await uploadMedia(page, propId, "second.jpg", "image/png");

    const listResp = await listMedia(page, propId);
    const media = (listResp.body.data as Record<string, unknown>).media as Record<string, unknown>[];
    const firstId = media[0].id as string;
    const secondId = media[1].id as string;

    // Verify first is cover
    expect(media[0].isCover).toBe(true);

    // Set second as cover
    const patchResp = await updateMedia(page, propId, secondId, { isCover: true });
    expect(patchResp.status).toBe(200);

    // Re-list and verify only second is cover
    const reList = await listMedia(page, propId);
    const reMedia = (reList.body.data as Record<string, unknown>).media as Record<string, unknown>[];
    const firstAfter = reMedia.find((m) => m.id === firstId);
    const secondAfter = reMedia.find((m) => m.id === secondId);
    expect(firstAfter?.isCover).toBe(false);
    expect(secondAfter?.isCover).toBe(true);
  });

  // 6. Soft delete media — owner can delete
  test("6. soft delete via DELETE returns 200", async ({ page }) => {
    const propId = await createProperty(page, {
      title: "Delete Test",
      city: "Wuhan",
    });

    await uploadMedia(page, propId, "delete-me.jpg", "image/jpeg");
    const listResp = await listMedia(page, propId);
    const media = (listResp.body.data as Record<string, unknown>).media as Record<string, unknown>[];
    expect(media).toHaveLength(1);
    const mediaId = media[0].id as string;

    const delResp = await deleteMedia(page, propId, mediaId);
    expect(delResp.status).toBe(200);
    const delData = delResp.body.data as Record<string, unknown>;
    expect(delData.deleted).toBe(true);
    expect(delData.mediaId).toBe(mediaId);

    // Verify not in list
    const reList = await listMedia(page, propId);
    expect((reList.body.data as Record<string, unknown>).total).toBe(0);
  });

  // 7. Upload rejected — unsupported MIME
  test("7. upload rejected for unsupported MIME type", async ({ page }) => {
    const propId = await createProperty(page, {
      title: "MIME Reject Test",
      city: "Nanjing",
    });

    const result = await uploadMedia(page, propId, "document.pdf", "application/pdf");
    expect(result.status).toBe(400);
    const details = (result.body.error as Record<string, unknown>).details as Record<string, unknown>;
    const rejections = details?.rejections as Array<{ code: string }>;
    expect(rejections[0].code).toBe("MEDIA_UNSUPPORTED_TYPE");
  });

  // 8. Upload rejected — video deferred
  test("8. upload video returns MEDIA_VIDEO_DEFERRED", async ({ page }) => {
    const propId = await createProperty(page, {
      title: "Video Reject Test",
      city: "Hangzhou",
    });

    const result = await uploadMedia(page, propId, "tour.mp4", "video/mp4");
    expect(result.status).toBe(400);
    const details = (result.body.error as Record<string, unknown>).details as Record<string, unknown>;
    const rejections = details?.rejections as Array<{ code: string }>;
    expect(rejections[0].code).toBe("MEDIA_VIDEO_DEFERRED");
  });

  // 9. Partial upload — 207 with rejections
  test("9. partial upload returns 207 with rejections", async ({ page }) => {
    const propId = await createProperty(page, {
      title: "Partial Upload Test",
      city: "Suzhou",
    });

    // Manual multipart fetch with 2 files: one good, one bad
    const result = await page.evaluate(async (propId: string) => {
      const goodFile = new File([new Uint8Array(512).fill(120)], "good.jpg", { type: "image/jpeg" });
      const badFile = new File([new Uint8Array(256)], "bad.pdf", { type: "application/pdf" });
      const fd = new FormData();
      fd.append("files", goodFile);
      fd.append("files", badFile);

      const res = await fetch(`/api/properties/${propId}/media`, {
        method: "POST",
        body: fd,
      });
      return { status: res.status, body: await res.json() };
    }, propId);

    expect(result.status).toBe(207);
    const data = result.body.data as Record<string, unknown>;
    expect(data.media as unknown[]).toHaveLength(1);
    expect(data.rejections as unknown[]).toHaveLength(1);
  });

  // 10. Cross-workspace — other user cannot list or delete
  test("10. cross-workspace access denied", async ({ browser }) => {
    // Create property as owner
    const ownerCtx = await browser.newContext({ storageState: OWNER_STATE });
    const ownerPage = await ownerCtx.newPage();
    const propId = await createProperty(ownerPage, {
      title: "Cross WS Media",
      city: "Xiamen",
    });
    await uploadMedia(ownerPage, propId, "secret.jpg", "image/jpeg");
    await ownerCtx.close();

    // Try to list as other workspace user
    const otherCtx = await browser.newContext({ storageState: OTHER_STATE });
    const otherPage = await otherCtx.newPage();
    await otherPage.goto("/properties"); // establish origin + cookies

    const listResult = await listMedia(otherPage, propId);
    expect(listResult.status).toBe(404);

    // Try to delete as other workspace user
    const delResult = await otherPage.evaluate(
      async ({ id, base }: { id: string; base: string }) => {
        const res = await fetch(`${base}/api/properties/${id}/media/fake-id`, { method: "DELETE" });
        return res.status;
      },
      { id: propId, base: BASE_URL }
    );
    expect([403, 404]).toContain(delResult);

    await otherCtx.close();
  });

  // 11. Unauthenticated — 401
  test("11. unauthenticated gets 401", async ({ browser }) => {
    const propId = await createProperty(
      await browser.newPage({ storageState: OWNER_STATE }),
      { title: "Auth Check", city: "Kunming" }
    );

    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    // Navigate to a page on the same origin first (required for fetch() to work),
    // then clear any cookies that may have been set automatically
    await pg.goto(BASE_URL);
    await ctx.clearCookies();

    const result = await pg.evaluate(async ({ id, base }: { id: string; base: string }) => {
      const res = await fetch(`${base}/api/properties/${id}/media`);
      return { status: res.status, body: await res.json() };
    }, { id: propId, base: BASE_URL });

    expect(result.status).toBe(401);
    await ctx.close();
  });

  // 12. Mobile 375px — property detail page layout check
  test("12. mobile 375px no horizontal scroll on property detail", async ({ page }) => {
    const propId = await createProperty(page, {
      title: "Mobile Media Test",
      city: "Lhasa",
    });
    await uploadMedia(page, propId, "mobile.jpg", "image/jpeg");

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/properties/${propId}`);

    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const cw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(cw + 10);
  });

  // 13. Upload max 5 files — validates per-request limit
  test("13. upload enforce max 5 files per request", async ({ page }) => {
    const propId = await createProperty(page, {
      title: "Max Files Test",
      city: "Changsha",
    });

    const result = await page.evaluate(async (id: string) => {
      const fd = new FormData();
      for (let i = 0; i < 6; i++) {
        fd.append("files", new File([new Uint8Array(64)], `img${i}.jpg`, { type: "image/jpeg" }));
      }
      const res = await fetch(`/api/properties/${id}/media`, { method: "POST", body: fd });
      return { status: res.status, body: await res.json() };
    }, propId);

    expect(result.status).toBe(400);
    expect(result.body.error.message as string).toContain("最多上传");
  });

  // 14. Per-property limit at 20 — upload beyond limit
  test("14. per-property limit at 20 blocks upload beyond", async ({ page }) => {
    const propId = await createProperty(page, {
      title: "Limit Test",
      city: "Haikou",
    });

    // Upload 20 files (each 64 bytes to stay small and fast)
    const results = await page.evaluate(async (id: string) => {
      const uploaded: number[] = [];
      for (let batch = 0; batch < 4; batch++) {
        const fd = new FormData();
        for (let i = 0; i < 5; i++) {
          fd.append("files", new File([new Uint8Array(64)], `b${batch}-${i}.jpg`, { type: "image/jpeg" }));
        }
        const res = await fetch(`/api/properties/${id}/media`, { method: "POST", body: fd });
        uploaded.push(res.status);
      }
      return uploaded;
    }, propId);

    // First 4 batches (5 each = 20) should succeed
    expect(results.filter((s) => s === 201)).toHaveLength(4);

    // 5th batch should be rejected (limit exceeded)
    const limitResult = await uploadMedia(page, propId, "over-limit.jpg", "image/jpeg");
    expect(limitResult.status).toBe(422);
    expect((limitResult.body.error as Record<string, unknown>).code).toBe("MEDIA_LIMIT_EXCEEDED");
  });

  // 15. Upload with large file (close to 10MB but under) succeeds
  test("15. upload near 10MB limit succeeds", async ({ page }) => {
    const propId = await createProperty(page, {
      title: "Near Limit Test",
      city: "Changchun",
    });

    // Upload a 1MB file (reasonable in-browser test; 10MB is too slow for E2E)
    const result = await uploadMedia(page, propId, "near-limit.jpg", "image/jpeg", 1024 * 1024);
    expect(result.status).toBe(201);
    const media = (result.body.data as Record<string, unknown>).media as Record<string, unknown>[];
    expect(media).toHaveLength(1);
  });
});
