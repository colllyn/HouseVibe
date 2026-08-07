/**
 * Unit tests for stripExif
 *
 * Covers:
 *   - All supported MIME types produce output buffers
 *   - GIF is converted to PNG (sharp GIF output is unreliable)
 *   - Buffer content differs after stripping (metadata removal)
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// Mock sharp to avoid native dependency issues
const mockSharp = vi.fn();
const mockRotate = vi.fn();
const mockToFormat = vi.fn();
const mockToBuffer = vi.fn();

mockRotate.mockReturnValue({ toFormat: mockToFormat });
mockToFormat.mockReturnValue({ toBuffer: mockToBuffer });

vi.mock("sharp", () => ({
  default: mockSharp,
}));

describe("stripExif", () => {
  let stripExif: (input: Buffer, mimeType: string) => Promise<Buffer>;

  beforeAll(async () => {
    const mod = await import("@/lib/media/strip-exif");
    stripExif = mod.stripExif;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSharp.mockReturnValue({ rotate: mockRotate });
    mockToBuffer.mockResolvedValue(Buffer.from("stripped-output"));
  });

  it("calls sharp with the input buffer", async () => {
    const input = Buffer.from("fake-jpeg-data");
    await stripExif(input, "image/jpeg");

    expect(mockSharp).toHaveBeenCalledWith(input);
  });

  it("applies auto-rotate and format conversion for JPEG", async () => {
    await stripExif(Buffer.from("data"), "image/jpeg");

    expect(mockRotate).toHaveBeenCalled();
    expect(mockToFormat).toHaveBeenCalledWith("jpeg", { quality: 92 });
  });

  it("uses png format for image/png MIME type", async () => {
    await stripExif(Buffer.from("data"), "image/png");

    expect(mockToFormat).toHaveBeenCalledWith("png", { quality: 92 });
  });

  it("uses webp format for image/webp MIME type", async () => {
    await stripExif(Buffer.from("data"), "image/webp");

    expect(mockToFormat).toHaveBeenCalledWith("webp", { quality: 92 });
  });

  it("converts GIF to PNG format (sharp GIF output is unreliable)", async () => {
    await stripExif(Buffer.from("data"), "image/gif");

    // GIF should be converted to PNG, not GIF format
    expect(mockToFormat).toHaveBeenCalledWith("png", { quality: 92 });
  });

  it("defaults unknown MIME types to jpeg", async () => {
    await stripExif(Buffer.from("data"), "image/bmp");

    expect(mockToFormat).toHaveBeenCalledWith("jpeg", { quality: 92 });
  });

  it("returns the stripped buffer from sharp", async () => {
    const expected = Buffer.from("stripped-output");
    const result = await stripExif(Buffer.from("data"), "image/jpeg");

    expect(result).toEqual(expected);
  });

  it("propagates sharp errors (no silent fallback)", async () => {
    mockToBuffer.mockRejectedValue(new Error("sharp processing failed"));

    await expect(
      stripExif(Buffer.from("corrupt-data"), "image/jpeg"),
    ).rejects.toThrow("sharp processing failed");
  });
});
