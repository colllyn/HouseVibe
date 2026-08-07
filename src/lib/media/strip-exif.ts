/**
 * EXIF stripping for uploaded images (P1-001).
 *
 * Strips all EXIF metadata (GPS, camera info, timestamps, etc.) from image
 * buffers before storage. Auto-rotates based on EXIF orientation so the
 * stripped image renders correctly.
 *
 * Uses sharp (already in project deps). Sharp strips all metadata by default;
 * the explicit .rotate() call ensures orientation is applied before stripping.
 */

import sharp from "sharp";

/**
 * Strip all EXIF metadata from an image buffer.
 *
 * - Auto-rotates based on EXIF orientation flag to preserve correct display
 * - Removes all other metadata: GPS, camera model, timestamps, etc.
 * - Preserves image format (jpg→jpg, png→png, webp→webp)
 *
 * @param input - Raw image buffer (JPEG, PNG, WebP, GIF)
 * @param mimeType - Original MIME type for format preservation
 * @returns Buffer with all EXIF metadata removed
 */
export async function stripExif(
  input: Buffer,
  mimeType: string,
): Promise<Buffer> {
  // Map MIME types to sharp output formats. GIF is converted to the
  // format implied by its MIME type since sharp has limited GIF support.
  const format = mimeTypeToSharpFormat(mimeType);

  // sharp strips all metadata by default. .rotate() reads EXIF orientation,
  // applies the rotation, then discards everything else.
  return sharp(input)
    .rotate() // auto-orient from EXIF, then strip
    .toFormat(format, { quality: 92 }) // near-lossless re-encode
    .toBuffer();
}

function mimeTypeToSharpFormat(
  mimeType: string,
): keyof sharp.FormatEnum {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/jpeg":
    default:
      return "jpeg";
  }
}
