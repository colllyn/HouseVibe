/**
 * Server-side PII redaction for client extraction input text.
 *
 * This module runs BEFORE the text reaches the DeepSeek Provider.
 * It uses deterministic regex patterns — no AI model involvement.
 *
 * Contract: docs/contracts/ai-contract.md v2.0 — Privacy §6
 *           docs/contracts/api-contract.md §10.3
 *
 * Reuses the same pattern architecture as redact-property-input.ts
 * (shared placeholder constants, PiiCategory type, RedactResult shape)
 * to prevent regex drift between property and client redaction paths.
 *
 * Client-specific: adds passport number detection; adjusts name patterns
 * for client self-introduction contexts. Omits property-specific patterns
 * (key_location, internal_note) that won't match client text.
 */

// ---------------------------------------------------------------------------
// Types (mirrors redact-property-input.ts for consistency)
// ---------------------------------------------------------------------------

export type PiiCategory =
  | "phone"
  | "landline"
  | "email"
  | "wechat"
  | "id_card"
  | "passport"
  | "contact_name"
  | "exact_address";

export interface RedactResult {
  /** The PII-stripped text safe to send to the Provider. */
  redactedText: string;
  /** Categories detected (without their actual values). */
  detectedCategories: readonly PiiCategory[];
  /** Whether the text is safe to forward after redaction. */
  safeToSend: boolean;
}

// ---------------------------------------------------------------------------
// Placeholder constants (aligned with redact-property-input.ts)
// ---------------------------------------------------------------------------

const P_PHONE = "[REDACTED_PHONE]";
const P_EMAIL = "[REDACTED_EMAIL]";
const P_WECHAT = "[REDACTED_WECHAT]";
const P_ID = "[REDACTED_ID_CARD]";
const P_PASSPORT = "[REDACTED_ID_CARD]";
const P_NAME = "[REDACTED_NAME]";
const P_ADDRESS = "[REDACTED_EXACT_ADDRESS]";

// ---------------------------------------------------------------------------
// Redaction function
// ---------------------------------------------------------------------------

/**
 * Apply all redaction rules to the client input text.
 * Rules are ordered: ID card (18 digits) before mobile (11 digits)
 * to prevent substring overlap. All regex patterns are created inline
 * on every call — no shared mutable state between invocations.
 */
export function redactClientInput(text: string): RedactResult {
  let result = text;
  const detected = new Set<PiiCategory>();

  // Each entry: [regex, placeholder, category]
  // Patterns aligned with redact-property-input.ts for common PII types.
  const rules: [RegExp, string, PiiCategory][] = [
    // Landline — before mobile to avoid partial match
    [/0\d{2,3}-\d{7,8}(?:-\d{1,6})?/g, P_PHONE, "landline"],
    // Email
    [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, P_EMAIL, "email"],
    // WeChat ID (wxid_xxx)
    [/wxid_[a-zA-Z0-9_-]+/gi, P_WECHAT, "wechat"],
    // WeChat with label
    [/(?:微信|微信号|[Ww]e[Cc]hat)[:：\s]*[a-zA-Z0-9_-]{6,20}/g, P_WECHAT, "wechat"],
    // Passport number — Chinese passport (E/G/D/S/P + 7-8 digits) and generic patterns
    // Must be before ID card to avoid overlap
    [/(?:护照号|护照号码|Passport\s*No)[.:：\s]*[A-Za-z]\d{7,9}/g, P_PASSPORT, "passport"],
    // Standalone Chinese passport format
    [/[EGDSP]\d{7,8}/g, P_PASSPORT, "passport"],
    // ID card: 17 digits + check digit/X — before mobile to avoid substring match
    [/\d{17}[\dXx]/g, P_ID, "id_card"],
    // ID card with label
    [/(?:身份证号|身份证号码|ID\s*Card|通行证号|军警官证)[:：\s]*[A-Za-z0-9]{8,30}/g, P_ID, "id_card"],
    // Mobile phone: 1[3-9]xxxxxxxxx — after ID card and passport
    [/1[3-9]\d{9}/g, P_PHONE, "phone"],
    // Client/contact name patterns — broader than property to catch self-introductions
    // Pattern: title + name (业主, 房东, 联系人, 客户, 租客, 我姓, 我叫, etc.)
    [/(?:业主|房东|联系人|出租人|代理人|中介|租客|客户|我姓|我叫|姓名|称呼)[:：\s]*[一-鿿]{2,4}(?:\s*(?:先生|女士|老师|经理))?/g, P_NAME, "contact_name"],
    // Standalone name in self-introduction: "我是xxx" / "我叫xxx"
    [/(?:我是|我叫)\s*[一-鿿]{2,4}(?:\s*(?:先生|女士|老师|经理))?/g, P_NAME, "contact_name"],
    // Exact address
    [/[一-鿿0-9]{1,6}?(?:栋|幢|号楼|单元|座)[一-鿿0-9-]{1,10}(?:单元|楼|层|室|号|房)[一-鿿0-9-]{0,10}/g, P_ADDRESS, "exact_address"],
    [/(?:门牌号|门牌|房号|房间号|门号|地址|住址|居住地)[:：\s]*\d{3,6}/g, P_ADDRESS, "exact_address"],
  ];

  for (const [pattern, placeholder, category] of rules) {
    const before = result;
    result = result.replace(pattern, (_match) => {
      detected.add(category);
      return placeholder;
    });

    // Safety: if a rule caused an unusually large change (e.g. removed 80%+ of text),
    // the input might be mostly PII — flag as unsafe
    if (before.length > 20 && result.length < before.length * 0.2) {
      return {
        redactedText: "",
        detectedCategories: Array.from(detected),
        safeToSend: false,
      };
    }
  }

  // After redaction, if the remaining text is effectively empty (just placeholders
  // and whitespace), the input is pure PII — reject
  const stripped = result.replace(/\[REDACTED_[A-Z_]+\]/g, "").trim();
  if (stripped.length < 3) {
    return {
      redactedText: "",
      detectedCategories: Array.from(detected),
      safeToSend: false,
    };
  }

  return {
    redactedText: result,
    detectedCategories: Array.from(detected),
    safeToSend: true,
  };
}
