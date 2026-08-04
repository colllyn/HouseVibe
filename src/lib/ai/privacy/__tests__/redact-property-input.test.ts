/**
 * redactPropertyInput — Unit Tests
 * Owner: test-engineer
 * Covers: P3-AI-PROPERTY-EXTRACT-PII-FIX-084
 *
 * All tests are deterministic regex-based — no AI. No real PII persisted.
 */

import { describe, it, expect } from "vitest";
import { redactPropertyInput } from "../redact-property-input";

// Helper to build text with enough property context (≥5 chars after PII stripped)
const ctx = "天河区一房3500元";

describe("redactPropertyInput", () => {
  // --- Phone ---

  it("redacts China mobile phone numbers", () => {
    const text = `${ctx} 联系我 13812345678 就行`;
    const result = redactPropertyInput(text);
    expect(result.safeToSend).toBe(true);
    expect(result.redactedText).not.toContain("13812345678");
    expect(result.redactedText).toContain("[REDACTED_PHONE]");
    expect(result.detectedCategories).toContain("phone");
  });

  it("redacts multiple mobile numbers", () => {
    const text = `${ctx} 打 13900001111 或 15899992222`;
    const result = redactPropertyInput(text);
    expect(result.safeToSend).toBe(true);
    expect(result.redactedText).not.toContain("13900001111");
    expect(result.redactedText).not.toContain("15899992222");
    const phones = result.redactedText.match(/\[REDACTED_PHONE\]/g);
    expect(phones).toHaveLength(2);
  });

  // --- Landline ---

  it("redacts landline numbers", () => {
    const text = `${ctx} 办公室 020-88886666 可联系`;
    const result = redactPropertyInput(text);
    expect(result.safeToSend).toBe(true);
    expect(result.redactedText).not.toContain("020-88886666");
    expect(result.redactedText).toContain("[REDACTED_PHONE]");
    expect(result.detectedCategories).toContain("landline");
  });

  // --- Email ---

  it("redacts email addresses", () => {
    const text = `${ctx} 发邮件到 landlord@example.com`;
    const result = redactPropertyInput(text);
    expect(result.safeToSend).toBe(true);
    expect(result.redactedText).not.toContain("landlord@example.com");
    expect(result.redactedText).toContain("[REDACTED_EMAIL]");
    expect(result.detectedCategories).toContain("email");
  });

  // --- WeChat ---

  it("redacts WeChat wxid IDs", () => {
    const text = `${ctx} 加我 wxid_abc123def 详聊`;
    const result = redactPropertyInput(text);
    expect(result.redactedText).not.toContain("wxid_abc123def");
    expect(result.redactedText).toContain("[REDACTED_WECHAT]");
    expect(result.detectedCategories).toContain("wechat");
  });

  it("redacts WeChat label patterns", () => {
    const text = `${ctx} 微信：zhangsan999 请备注看房`;
    const result = redactPropertyInput(text);
    expect(result.redactedText).not.toContain("zhangsan999");
    expect(result.redactedText).toContain("[REDACTED_WECHAT]");
  });

  // --- ID Card ---

  it("redacts Chinese ID card numbers", () => {
    const text = `${ctx} 房东身份证 440106199001011234 请核实`;
    const result = redactPropertyInput(text);
    expect(result.redactedText).not.toContain("440106199001011234");
    expect(result.redactedText).toContain("[REDACTED_ID_CARD]");
    expect(result.detectedCategories).toContain("id_card");
  });

  it("redacts ID card with X suffix", () => {
    const text = `${ctx} 身份证号 11010119800101567X`;
    const result = redactPropertyInput(text);
    expect(result.redactedText).toContain("[REDACTED_ID_CARD]");
  });

  // --- Contact Name ---

  it("redacts owner name labels", () => {
    const text = `${ctx} 业主：张三，电话联系`;
    const result = redactPropertyInput(text);
    expect(result.redactedText).toContain("[REDACTED_NAME]");
    expect(result.detectedCategories).toContain("contact_name");
  });

  it("redacts contact person labels", () => {
    const text = `${ctx} 联系人：李女士`;
    const result = redactPropertyInput(text);
    expect(result.redactedText).toContain("[REDACTED_NAME]");
  });

  it("redacts landlord labels", () => {
    const text = `${ctx} 房东：王先生，随时看房`;
    const result = redactPropertyInput(text);
    expect(result.redactedText).toContain("[REDACTED_NAME]");
  });

  // --- Exact Address ---

  it("redacts exact building/unit/room numbers", () => {
    const text = `${ctx} 房子在 3栋2单元1502号 随时可看`;
    const result = redactPropertyInput(text);
    expect(result.redactedText).toContain("[REDACTED_EXACT_ADDRESS]");
    expect(result.detectedCategories).toContain("exact_address");
  });

  it("redacts door number labels", () => {
    const text = `${ctx} 门牌号：1502`;
    const result = redactPropertyInput(text);
    expect(result.redactedText).toContain("[REDACTED_EXACT_ADDRESS]");
  });

  // --- Key Location ---

  it("redacts key location mentions", () => {
    const text = `${ctx} 钥匙放在门口地毯下面`;
    const result = redactPropertyInput(text);
    expect(result.redactedText).toContain("[REDACTED_KEY_LOCATION]");
    expect(result.detectedCategories).toContain("key_location");
  });

  it("redacts password lock mentions", () => {
    const text = `${ctx} 密码锁密码：886644`;
    const result = redactPropertyInput(text);
    expect(result.redactedText).toContain("[REDACTED_KEY_LOCATION]");
  });

  // --- Internal Notes ---

  it("redacts internal notes", () => {
    const text = `${ctx} 内部备注：租客比较挑剔，要小心处理`;
    const result = redactPropertyInput(text);
    expect(result.redactedText).toContain("[REDACTED_INTERNAL_NOTE]");
    expect(result.detectedCategories).toContain("internal_note");
  });

  // --- Property Facts Preserved ---

  it("preserves property facts: price, area, layout, orientation", () => {
    const text =
      "天河区温馨一房，月租3500元，面积45平米，1室1厅，朝南，12楼，有电梯，精装修";
    const result = redactPropertyInput(text);
    expect(result.safeToSend).toBe(true);
    expect(result.redactedText).toContain("3500");
    expect(result.redactedText).toContain("45平米");
    expect(result.redactedText).toContain("1室1厅");
    expect(result.redactedText).toContain("朝南");
    expect(result.redactedText).toContain("有电梯");
    expect(result.redactedText).toContain("精装修");
    // No false redactions on property facts
    expect(result.redactedText).not.toContain("[REDACTED_");
  });

  it("preserves facilities, tags, and selling points", () => {
    const text =
      "配套：空调、洗衣机、冰箱齐全。卖点：近地铁、采光好、新装修";
    const result = redactPropertyInput(text);
    expect(result.safeToSend).toBe(true);
    expect(result.redactedText).toContain("空调");
    expect(result.redactedText).toContain("洗衣机");
    expect(result.redactedText).toContain("近地铁");
    expect(result.redactedText).toContain("采光好");
  });

  // --- Multi-category ---

  it("redacts multiple PII categories simultaneously", () => {
    const text =
      "天河区一房，3500元。房东：张三，电话13812345678，微信wxid_abc123，" +
      "身份证440106199001011234。房子在3栋2单元1502号，钥匙放门口地毯下。";
    const result = redactPropertyInput(text);

    expect(result.safeToSend).toBe(true);
    expect(result.redactedText).toContain("[REDACTED_NAME]");
    expect(result.redactedText).toContain("[REDACTED_PHONE]");
    expect(result.redactedText).toContain("[REDACTED_WECHAT]");
    expect(result.redactedText).toContain("[REDACTED_ID_CARD]");
    expect(result.redactedText).toContain("[REDACTED_EXACT_ADDRESS]");
    expect(result.redactedText).toContain("[REDACTED_KEY_LOCATION]");

    expect(result.detectedCategories).toContain("contact_name");
    expect(result.detectedCategories).toContain("phone");
    expect(result.detectedCategories).toContain("wechat");
    expect(result.detectedCategories).toContain("id_card");
    expect(result.detectedCategories).toContain("exact_address");
    expect(result.detectedCategories).toContain("key_location");

    // Property facts preserved
    expect(result.redactedText).toContain("天河区");
    expect(result.redactedText).toContain("3500");
    expect(result.redactedText).toContain("一房");
  });

  // --- High-risk rejection ---

  it("rejects input that is mostly PII after redaction", () => {
    // Pure PII — after stripping placeholders, < 5 chars remain
    const text = "13812345678 440106199001011234";
    const result = redactPropertyInput(text);
    expect(result.safeToSend).toBe(false);
    expect(result.redactedText).toBe("");
  });

  it("rejects input with raw identity documents", () => {
    const text =
      `${ctx} 身份证号码：440106199001011234 护照号：E12345678 通行证号：W12345678`;
    const result = redactPropertyInput(text);
    // The identity block pattern catches these
    expect(result.detectedCategories).toContain("id_card");
  });

  // --- No false positives ---

  it("does not redact non-PII text", () => {
    const text =
      "天河区体育西路，距离地铁3号线500米，月租3500元，1房1厅，朝南，精装修，有电梯，12楼";
    const result = redactPropertyInput(text);
    expect(result.safeToSend).toBe(true);
    expect(result.redactedText).toBe(text);
    expect(result.detectedCategories).toHaveLength(0);
  });

  it("does not redact floor numbers as addresses", () => {
    const text = "这间房子在12楼，总高30层";
    const result = redactPropertyInput(text);
    expect(result.safeToSend).toBe(true);
    expect(result.redactedText).toContain("12楼");
    expect(result.redactedText).toContain("30层");
  });
});
