/**
 * redactClientInput — Unit Tests
 * Verifies deterministic PII redaction for client extraction input text.
 * No AI model involvement. No real network calls.
 */

import { describe, it, expect } from "vitest";
import { redactClientInput } from "@/lib/ai/privacy/redact-client-input";

describe("redactClientInput", () => {
  // --- Phone ---

  it("redacts mobile phone numbers", () => {
    const r = redactClientInput("请联系我 13812345678 详谈");
    expect(r.redactedText).not.toContain("13812345678");
    expect(r.redactedText).toContain("[REDACTED_PHONE]");
    expect(r.detectedCategories).toContain("phone");
    expect(r.safeToSend).toBe(true);
  });

  it("redacts multiple phone numbers", () => {
    const r = redactClientInput("13800000001 或 13900000002");
    expect(r.redactedText).not.toContain("13800000001");
    expect(r.redactedText).not.toContain("13900000002");
  });

  // --- Landline ---

  it("redacts landline numbers", () => {
    const r = redactClientInput("公司电话 020-12345678，预算3000天河区");
    expect(r.redactedText).not.toContain("020-12345678");
    expect(r.redactedText).toContain("[REDACTED_PHONE]");
    expect(r.detectedCategories).toContain("landline");
    expect(r.redactedText).toContain("预算3000");
  });

  // --- Email ---

  it("redacts email addresses", () => {
    const r = redactClientInput("我的邮箱 client@example.com，想租天河区两房");
    expect(r.redactedText).not.toContain("client@example.com");
    expect(r.redactedText).toContain("[REDACTED_EMAIL]");
    expect(r.detectedCategories).toContain("email");
    expect(r.redactedText).toContain("天河区");
  });

  // --- WeChat ---

  it("redacts WeChat IDs (wxid_ prefix)", () => {
    const r = redactClientInput("加我 wxid_abc123def，预算5000以内");
    expect(r.redactedText).not.toContain("wxid_abc123def");
    expect(r.redactedText).toContain("[REDACTED_WECHAT]");
    expect(r.detectedCategories).toContain("wechat");
    expect(r.redactedText).toContain("5000");
  });

  it("redacts WeChat with label", () => {
    const r = redactClientInput("微信：zhangsan_888，天河区一房");
    expect(r.redactedText).not.toContain("zhangsan_888");
    expect(r.redactedText).toContain("[REDACTED_WECHAT]");
    expect(r.redactedText).toContain("天河区");
  });

  // --- ID Card ---

  it("redacts 18-digit ID card numbers", () => {
    const r = redactClientInput("身份证 440106199001011234，租房需求两房一厅");
    expect(r.redactedText).not.toContain("440106199001011234");
    expect(r.redactedText).toContain("[REDACTED_ID_CARD]");
    expect(r.detectedCategories).toContain("id_card");
    expect(r.redactedText).toContain("两房一厅");
  });

  it("redacts ID card with label", () => {
    const r = redactClientInput("身份证号：440106199001011234，需求越秀区");
    expect(r.redactedText).not.toContain("440106199001011234");
    expect(r.redactedText).toContain("越秀区");
  });

  // --- Passport ---

  it("redacts Chinese passport numbers", () => {
    const r = redactClientInput("护照 E12345678，想租天河区两房");
    expect(r.redactedText).not.toContain("E12345678");
    expect(r.redactedText).toContain("[REDACTED_ID_CARD]");
    expect(r.detectedCategories).toContain("passport");
    expect(r.redactedText).toContain("天河区");
  });

  it("redacts passport with label", () => {
    const r = redactClientInput("护照号：G12345678，预算3000");
    expect(r.redactedText).not.toContain("G12345678");
    expect(r.redactedText).toContain("3000");
  });

  // --- Name ---

  it("redacts client self-introduction names", () => {
    const r = redactClientInput("我叫张三，想在天河区租房");
    expect(r.redactedText).not.toContain("张三");
    expect(r.redactedText).toContain("[REDACTED_NAME]");
    expect(r.detectedCategories).toContain("contact_name");
    // Business facts preserved
    expect(r.redactedText).toContain("天河区");
    expect(r.redactedText).toContain("租房");
  });

  it("redacts contact person names with title", () => {
    const r = redactClientInput("联系人：李四 先生，预算3000天河区");
    expect(r.redactedText).not.toContain("李四");
    expect(r.redactedText).toContain("[REDACTED_NAME]");
    expect(r.redactedText).toContain("3000");
  });

  it("redacts client label with name", () => {
    const r = redactClientInput("客户王五需要两房一厅，天河区预算5000");
    expect(r.redactedText).not.toContain("王五");
    expect(r.redactedText).toContain("[REDACTED_NAME]");
    // Business facts preserved
    expect(r.redactedText).toContain("两房一厅");
    expect(r.redactedText).toContain("5000");
  });

  // --- Exact address ---

  it("redacts exact address with structural pattern", () => {
    const r = redactClientInput("我住在3栋502室，想换到天河区");
    expect(r.redactedText).not.toContain("3栋502室");
    expect(r.redactedText).toContain("[REDACTED_EXACT_ADDRESS]");
    expect(r.detectedCategories).toContain("exact_address");
    // Area preserved
    expect(r.redactedText).toContain("天河区");
  });

  it("redacts exact address with label-based pattern", () => {
    const r = redactClientInput("地址：510620，预算3000");
    expect(r.redactedText).not.toContain("510620");
    expect(r.redactedText).toContain("[REDACTED_EXACT_ADDRESS]");
    expect(r.redactedText).toContain("3000");
  });

  it("preserves district/area names while redacting exact address", () => {
    const r = redactClientInput("现住体育西路3号楼501室，想在越秀区找房");
    expect(r.redactedText).toContain("[REDACTED_EXACT_ADDRESS]");
    // Districts and business facts preserved
    expect(r.redactedText).toContain("越秀区");
    expect(r.redactedText).toContain("找房");
  });

  // --- Business fact preservation ---

  it("preserves budget information", () => {
    const r = redactClientInput("预算3000到5000，天河区两房");
    expect(r.redactedText).toContain("3000");
    expect(r.redactedText).toContain("5000");
    expect(r.redactedText).toContain("天河区");
    expect(r.redactedText).toContain("两房");
    expect(r.safeToSend).toBe(true);
  });

  it("preserves area preferences", () => {
    const r = redactClientInput("想在越秀区或海珠区，面积80平以上");
    expect(r.redactedText).toContain("越秀区");
    expect(r.redactedText).toContain("海珠区");
    expect(r.redactedText).toContain("80平");
  });

  it("preserves rental type and move-in date", () => {
    const r = redactClientInput("整租，八月中旬能入住，需要电梯");
    expect(r.redactedText).toContain("整租");
    expect(r.redactedText).toContain("八月中旬");
    expect(r.redactedText).toContain("电梯");
    expect(r.safeToSend).toBe(true);
  });

  it("preserves commute and school preferences", () => {
    const r = redactClientInput("靠近三号线，最好有学区，可以养猫");
    expect(r.redactedText).toContain("三号线");
    expect(r.redactedText).toContain("学区");
    expect(r.redactedText).toContain("猫");
    expect(r.safeToSend).toBe(true);
  });

  it("preserves layout preferences", () => {
    const r = redactClientInput("需求两房一厅，朝南，精装修");
    expect(r.redactedText).toContain("两房一厅");
    expect(r.redactedText).toContain("朝南");
    expect(r.redactedText).toContain("精装修");
    expect(r.safeToSend).toBe(true);
  });

  // --- Mixed PII + facts ---

  it("redacts PII while preserving facts in mixed input", () => {
    const r = redactClientInput(
      "我叫刘芳，电话13800009999，微信liufang_wx，预算4000以内，想在珠江新城附近租个一房，有电梯最好"
    );
    expect(r.redactedText).not.toContain("刘芳");
    expect(r.redactedText).not.toContain("13800009999");
    expect(r.redactedText).not.toContain("liufang_wx");
    expect(r.redactedText).toContain("[REDACTED_NAME]");
    expect(r.redactedText).toContain("[REDACTED_PHONE]");
    expect(r.redactedText).toContain("[REDACTED_WECHAT]");
    // Facts preserved
    expect(r.redactedText).toContain("4000");
    expect(r.redactedText).toContain("珠江新城");
    expect(r.redactedText).toContain("一房");
    expect(r.redactedText).toContain("电梯");
    expect(r.safeToSend).toBe(true);
  });

  // --- Whitespace-only input ---

  it("whitespace-only input is unsafe", () => {
    const r = redactClientInput("   ");
    expect(r.safeToSend).toBe(false);
  });

  // --- Empty input ---

  it("empty input is unsafe", () => {
    const r = redactClientInput("");
    expect(r.safeToSend).toBe(false);
  });

  // --- Pure PII input → unsafe ---

  it("pure phone number input is unsafe", () => {
    const r = redactClientInput("13800001111 13900002222");
    expect(r.safeToSend).toBe(false);
  });

  it("mostly PII input is unsafe", () => {
    const r = redactClientInput(
      "13812345678 440106199001011234 张三 微信abc123"
    );
    expect(r.safeToSend).toBe(false);
  });

  // --- No PII → passes through ---

  it("clean business text passes through unchanged", () => {
    const input = "预算5000以内，天河区两房，朝南，有电梯，8月可入住";
    const r = redactClientInput(input);
    expect(r.redactedText).toBe(input);
    expect(r.detectedCategories).toHaveLength(0);
    expect(r.safeToSend).toBe(true);
  });

  it("does not mutate input", () => {
    const input = "联系人：张三 预算3000";
    redactClientInput(input);
    expect(input).toBe("联系人：张三 预算3000");
  });
});
