// ============================================================
// AI Correction Diff — P3-AI-012
// Owner: ai-deepseek-engineer
// Contract: docs/contracts/ai-contract.md
//
// Server-side diff between AI extraction output and user-confirmed
// data. Privacy-safe: sensitive fields never stored in diffs.
// ============================================================

// ============================================================
// Types
// ============================================================

export type ChangeType = "modified" | "added" | "removed";

export interface FieldDiff {
  field: string;
  changeType: ChangeType;
  originalValue?: unknown;
  confirmedValue?: unknown;
}

// ============================================================
// Sensitive field rules (per ai-contract)
// ============================================================

const SENSITIVE_FIELDS = new Set([
  // camelCase (from AI extraction output)
  "ownerName",
  "ownerPhone",
  "ownerWechat",
  "exactAddress",
  "buildingNo",
  "unitNo",
  "roomNo",
  "keyLocation",
  "clientPhone",
  "clientWechat",
  "clientName",
  "clientIdNumber",
  // snake_case (from HTTP POST body)
  "owner_name",
  "owner_phone",
  "owner_wechat",
  "exact_address",
  "building_no",
  "unit_no",
  "room_no",
  "key_location",
  "client_phone",
  "client_wechat",
  "client_name",
  "client_id_number",
  "phone",
  "wechat",
  "internal_notes",
]);

/**
 * Fields that must never appear in correction logs even in redacted form.
 */
const FULLY_EXCLUDED_FIELDS = new Set([
  // camelCase
  "ownerPhone",
  "ownerWechat",
  "clientPhone",
  "clientWechat",
  "clientIdNumber",
  "exactAddress",
  "keyLocation",
  // snake_case
  "owner_phone",
  "owner_wechat",
  "client_phone",
  "client_wechat",
  "client_id_number",
  "exact_address",
  "key_location",
  "phone",
  "wechat",
]);

// ============================================================
// Diff Computation
// ============================================================

/**
 * Compute field-level diff between original AI output and user-confirmed data.
 *
 * Rules:
 * - Fields that changed: recorded as "modified" with original + confirmed values
 * - Fields in confirmed but not in original: "added"
 * - Fields in original but not in confirmed: "removed"
 * - Sensitive fields are excluded entirely from the diff
 * - Null/undefined values are treated as absent
 * - Only 1 level deep (flat object comparison)
 */
export function computeFieldDiff(
  originalOutput: Record<string, unknown>,
  userConfirmed: Record<string, unknown>
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const allKeys = new Set([...Object.keys(originalOutput), ...Object.keys(userConfirmed)]);

  for (const key of allKeys) {
    // Skip fully excluded fields
    if (FULLY_EXCLUDED_FIELDS.has(key)) continue;

    const originalVal = originalOutput[key];
    const confirmedVal = userConfirmed[key];

    const origDefined = originalVal !== undefined && originalVal !== null;
    const confDefined = confirmedVal !== undefined && confirmedVal !== null;

    // Skip if both undefined/null
    if (!origDefined && !confDefined) continue;

    if (!origDefined && confDefined) {
      // User added a field that AI didn't extract
      // Don't record "added" fields if they appear sensitive
      if (SENSITIVE_FIELDS.has(key)) continue;
      diffs.push({ field: key, changeType: "added", confirmedValue: confirmedVal });
    } else if (origDefined && !confDefined) {
      // User removed/deleted a field
      if (SENSITIVE_FIELDS.has(key)) continue;
      diffs.push({ field: key, changeType: "removed", originalValue: originalVal });
    } else if (!isEqual(originalVal, confirmedVal)) {
      // Field was modified
      if (SENSITIVE_FIELDS.has(key)) continue;
      diffs.push({
        field: key,
        changeType: "modified",
        originalValue: sanitizeFieldValue(key, originalVal),
        confirmedValue: sanitizeFieldValue(key, confirmedVal),
      });
    }
  }

  return diffs;
}

// ============================================================
// Helpers
// ============================================================

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function sanitizeFieldValue(field: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (FULLY_EXCLUDED_FIELDS.has(field)) return "[已脱敏]";
  return value;
}

/**
 * Check if a correction event should be recorded.
 * Only triggers when a requestId is present (AI-assisted creation).
 * Manual creation (no requestId) is skipped.
 */
export function shouldRecordDiff(requestId?: string | null): boolean {
  return !!requestId;
}
