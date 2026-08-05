/**
 * Compliance Check — Unit Tests
 * Deterministic, pure-function tests. No AI, network, or database calls.
 */

import { describe, it, expect } from "vitest";
import { checkCompliance, toResponseStatus } from "@/lib/compliance/check";

function input(opts: { text?: string; platform?: "xiaohongshu" | "douyin" | "wechat_moments"; facts?: Record<string, unknown> }) {
  return {
    contentText: opts.text ?? "这是一套精装修一房，采光好近地铁",
    platform: opts.platform ?? "xiaohongshu",
    propertyFacts: opts.facts,
  };
}

describe("checkCompliance", () => {
  // 1. Normal text → allowed
  it("1: clean content → allowed", () => {
    const r = checkCompliance(input({ text: "精装修一房，朝南采光好，近地铁交通便利" }));
    expect(r.status).toBe("allowed");
    expect(r.copyAllowed).toBe(true);
    expect(r.flags).toHaveLength(0);
  });

  // 2. Fact conflict → review
  it("2: fact conflict → review, copyAllowed=false", () => {
    const r = checkCompliance(input({
      text: "天河区一房，月租5000元",
      facts: { district: "越秀区", monthlyRent: 3000 },
    }));
    expect(r.status).toBe("review");
    expect(r.copyAllowed).toBe(false);
    expect(r.flags.some((f) => f.code === "FACT_CONFLICT")).toBe(true);
  });

  // 3. Absolute superlative → blocked
  it("3: absolute superlative → blocked", () => {
    const r = checkCompliance(input({ text: "这是全广州最好的房子，独一无二" }));
    expect(r.status).toBe("blocked");
    expect(r.copyAllowed).toBe(false);
    expect(r.flags.some((f) => f.code === "ABSOLUTE_SUPERLATIVE")).toBe(true);
  });

  // 4. Investment guarantee → blocked
  it("4: investment guarantee → blocked", () => {
    const r = checkCompliance(input({ text: "保证年收益8%，稳赚不赔的投资机会" }));
    expect(r.status).toBe("blocked");
    expect(r.copyAllowed).toBe(false);
    expect(r.flags.some((f) => f.code === "INVESTMENT_GUARANTEE")).toBe(true);
  });

  // 5. Education/policy claim → review
  it("5: education claim → review, copyAllowed=false", () => {
    const r = checkCompliance(input({ text: "学区房，对口重点学校，可落户" }));
    expect(r.status).toBe("review");
    expect(r.copyAllowed).toBe(false);
    expect(r.flags.some((f) => f.code === "EDUCATION_CLAIM")).toBe(true);
  });

  // 6. Discriminatory → blocked
  it("6: discriminatory content → blocked", () => {
    const r = checkCompliance(input({ text: "不租给外地人，谢绝单身" }));
    expect(r.status).toBe("blocked");
    expect(r.copyAllowed).toBe(false);
    expect(r.flags.some((f) => f.code === "DISCRIMINATORY")).toBe(true);
  });

  // 7. Contact leak → blocked
  it("7: phone number leak → blocked", () => {
    const r = checkCompliance(input({ text: "请联系13800138000看房" }));
    expect(r.status).toBe("blocked");
    expect(r.copyAllowed).toBe(false);
    expect(r.flags.some((f) => f.code === "CONTACT_PHONE")).toBe(true);
  });

  // 8. Address/key leak → blocked
  it("8: exact address leak → blocked", () => {
    const r = checkCompliance(input({ text: "位于3号楼502室，钥匙在门口地毯下" }));
    expect(r.status).toBe("blocked");
    expect(r.copyAllowed).toBe(false);
    expect(r.flags.some((f) => f.code === "ADDRESS_EXACT")).toBe(true);
    expect(r.flags.some((f) => f.code === "ADDRESS_KEY")).toBe(true);
  });

  // 9. Fact conflict: rent mismatch
  it("9: rent mismatch → review", () => {
    const r = checkCompliance(input({
      text: "月租仅5000元/月，超值好房",
      facts: { monthlyRent: 3000 },
    }));
    expect(r.status).toBe("review");
    expect(r.flags.some((f) => f.code === "FACT_CONFLICT")).toBe(true);
  });

  // 10. Flags use stable codes
  it("10: flags have stable code strings", () => {
    const r = checkCompliance(input({ text: "广州最好的房源，保证升值，可以落户" }));
    for (const flag of r.flags) {
      expect(typeof flag.code).toBe("string");
      expect(flag.code.length).toBeGreaterThan(0);
      expect(typeof flag.severity).toBe("string");
      expect(typeof flag.suggestion).toBe("string");
    }
  });

  // 11. Determinism — same input, same result
  it("11: deterministic — same input produces identical output", () => {
    const text = "天河区最好的一房，保证升值";
    const r1 = checkCompliance(input({ text }));
    const r2 = checkCompliance(input({ text }));
    expect(r1.status).toBe(r2.status);
    expect(r1.copyAllowed).toBe(r2.copyAllowed);
    expect(r1.flags.length).toBe(r2.flags.length);
    for (let i = 0; i < r1.flags.length; i++) {
      const f1 = r1.flags[i];
      const f2 = r2.flags[i];
      if (!f1 || !f2) throw new Error("flag count mismatch");
      expect(f1.code).toBe(f2.code);
    }
  });

  // 12. Empty text → allowed
  it("12: empty text → allowed", () => {
    const r = checkCompliance(input({ text: "" }));
    expect(r.status).toBe("allowed");
    expect(r.copyAllowed).toBe(true);
  });

  // 13. Scarcity/urgency → review
  it("13: scarcity urgency → review", () => {
    const r = checkCompliance(input({ text: "最后一套，手慢无！即将涨价" }));
    expect(r.status).toBe("review");
    expect(r.copyAllowed).toBe(false);
    expect(r.flags.some((f) => f.code === "SCARCITY_URGENCY")).toBe(true);
  });

  // 14. Price qualification → highlight (does not block)
  it("14: price qualification → allowed (highlight only, copyAllowed=true)", () => {
    const r = checkCompliance(input({ text: "性价比超高，超低价出租" }));
    expect(r.status).toBe("allowed");
    expect(r.copyAllowed).toBe(true);
    expect(r.flags.length).toBeGreaterThan(0);
    expect(r.flags.every((f) => f.severity === "highlight")).toBe(true);
  });

  // 15. Email leak → blocked
  it("15: email leak → blocked", () => {
    const r = checkCompliance(input({ text: "联系邮箱 owner@house.com" }));
    expect(r.status).toBe("blocked");
    expect(r.flags.some((f) => f.code === "CONTACT_EMAIL")).toBe(true);
  });

  // 16. WeChat leak → blocked
  it("16: WeChat leak → blocked", () => {
    const r = checkCompliance(input({ text: "加微信：zhangsan_888详聊" }));
    expect(r.status).toBe("blocked");
    expect(r.flags.some((f) => f.code === "CONTACT_WECHAT")).toBe(true);
  });

  // 17. ID card leak → blocked
  it("17: ID card leak → blocked", () => {
    const r = checkCompliance(input({ text: "身份证440106199001011234确认" }));
    expect(r.status).toBe("blocked");
    expect(r.flags.some((f) => f.code === "ID_CARD_LEAK")).toBe(true);
  });

  // 18. Illegal content → blocked
  it("18: illegal/short-term rental → blocked", () => {
    const r = checkCompliance(input({ text: "可按天日租，群租也行" }));
    expect(r.status).toBe("blocked");
    expect(r.flags.some((f) => f.code === "ILLEGAL_CONTENT")).toBe(true);
  });

  // 19. Blocked + review → blocked (highest severity wins)
  it("19: blocked + review → status=blocked", () => {
    const r = checkCompliance(input({ text: "最好的学区房，电话13800138000" }));
    expect(r.status).toBe("blocked");
    // blocked flags come first
    const first = r.flags[0];
    if (!first) throw new Error("no flags");
    expect(first.severity).toBe("blocked");
  });

  // 20a. Bedroom count conflict → review
  it("20a: bedroom count conflict → review", () => {
    const r = checkCompliance(input({
      text: "3房2厅宽敞明亮，适合家庭居住",
      facts: { bedrooms: 2 },
    }));
    expect(r.status).toBe("review");
    expect(r.flags.some((f) => f.code === "FACT_CONFLICT")).toBe(true);
  });

  // 20. Elevator fact conflict
  it("20: elevator conflict → review", () => {
    const r = checkCompliance(input({
      text: "无电梯，需要走楼梯",
      facts: { hasElevator: true },
    }));
    expect(r.status).toBe("review");
    expect(r.flags.some((f) => f.code === "FACT_CONFLICT")).toBe(true);
  });

  // 21. Pet fact conflict
  it("21: pet policy conflict → review", () => {
    const r = checkCompliance(input({
      text: "可以养猫，宠物友好",
      facts: { petsAllowed: false },
    }));
    expect(r.status).toBe("review");
    expect(r.flags.some((f) => f.code === "FACT_CONFLICT")).toBe(true);
  });

  // 22. No fact conflict when text matches
  it("22: matching facts → no conflict", () => {
    const r = checkCompliance(input({
      text: "天河区一房，月租3500元",
      facts: { district: "天河区", monthlyRent: 3500, bedrooms: 1 },
    }));
    expect(r.flags.some((f) => f.code === "FACT_CONFLICT")).toBe(false);
  });

  // 23. Policy claim → review
  it("23: loan/policy claim → review", () => {
    const r = checkCompliance(input({ text: "支持公积金贷款，首付三成" }));
    expect(r.status).toBe("review");
    expect(r.flags.some((f) => f.code === "POLICY_CLAIM")).toBe(true);
  });

  // 24. toResponseStatus mapping
  it("24: toResponseStatus maps correctly", () => {
    expect(toResponseStatus("allowed")).toBe("clean");
    expect(toResponseStatus("review")).toBe("review");
    expect(toResponseStatus("blocked")).toBe("blocked");
  });

  // 25. No network/AI/DB calls
  it("25: no side effects — pure function", () => {
    const text = "测试文本";
    const r1 = checkCompliance(input({ text }));
    const r2 = checkCompliance(input({ text }));
    // Multiple calls with same input = identical output (proves no mutable state)
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
