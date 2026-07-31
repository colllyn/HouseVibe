/**
 * Open Redirect protection: validates that a redirect target is a safe,
 * site-relative path.
 *
 * Allowed:
 *   /dashboard
 *   /invites/abc123
 *
 * Blocked:
 *   //evil.example
 *   https://evil.example
 *   http://evil.example
 *   \evil.example          (backslash bypass)
 *   /%2f%2fevil.example   (encoded external URL)
 *   javascript:alert(1)
 *   data:text/html,<script>
 *   "" / null / undefined
 */
export function getSafeNextPath(value: string | null | undefined): string {
  const DEFAULT = "/dashboard";

  if (!value) return DEFAULT;

  // Must start with a single forward slash
  if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT;

  // No protocol prefixes
  if (/^https?:\/\//i.test(value)) return DEFAULT;

  // No backslash bypass attempts
  if (value.includes("\\")) return DEFAULT;

  // Decode and re-validate to catch encoded attacks
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return DEFAULT;
  }

  // If decoding changed the value, re-validate recursively
  if (decoded !== value) {
    return getSafeNextPath(decoded);
  }

  // Only allow safe URL characters in relative paths
  if (!/^\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/.test(value)) {
    return DEFAULT;
  }

  return value;
}
