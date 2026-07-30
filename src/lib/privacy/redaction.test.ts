import { describe, it, expect } from "vitest";
import { redactSensitiveFields, isSensitiveField, getSensitiveFieldNames } from "@/lib/privacy/redaction";

describe("redactSensitiveFields", () => {
  const FULL_PROPERTY = {
    id: "prop-001", title: "朝阳区三室一厅",
    owner_name: "张三", owner_phone: "13800138000", owner_wechat: "zhangsan_wx",
    client_phone: "13900139000", client_wechat: "client_wx",
    exact_address: "北京市朝阳区某某路100号", building_no: "3", unit_no: "2", room_no: "1501",
    internal_notes: "房东很挑剔", key_location: "门口地毯下",
    price: 5000, area_sqm: 90, district: "朝阳区",
  };

  it("removes all 11 sensitive fields", () => {
    const r = redactSensitiveFields(FULL_PROPERTY);
    ["owner_name","owner_phone","owner_wechat","client_phone","client_wechat",
     "exact_address","building_no","unit_no","room_no","internal_notes","key_location"]
      .forEach(f => expect(r).not.toHaveProperty(f));
  });

  it("preserves non-sensitive fields", () => {
    const r = redactSensitiveFields(FULL_PROPERTY);
    expect(r.id).toBe("prop-001");
    expect(r.price).toBe(5000);
  });

  it("does NOT mutate input", () => {
    const input = { ...FULL_PROPERTY };
    redactSensitiveFields(input);
    expect(input.owner_name).toBe("张三");
  });

  it("handles empty objects", () => expect(redactSensitiveFields({})).toEqual({}));

  it("redacts only top-level fields", () => {
    const nested = { id: "t", owner_name: "rm", meta: { owner_name: "keep", price: 5 } };
    const r = redactSensitiveFields(nested);
    expect(r).not.toHaveProperty("owner_name");
    expect((r as Record<string, unknown>).meta).toEqual({ owner_name: "keep", price: 5 });
  });
});

describe("isSensitiveField", () => {
  it("returns true for sensitive fields", () => {
    expect(isSensitiveField("owner_name")).toBe(true);
    expect(isSensitiveField("key_location")).toBe(true);
  });
  it("returns false for normal fields", () => {
    expect(isSensitiveField("id")).toBe(false);
  });
});

describe("getSensitiveFieldNames", () => {
  it("returns 11 fields", () => expect(getSensitiveFieldNames().size).toBe(11));
});
