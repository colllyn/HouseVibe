import { describe, it, expect } from "vitest";
import { CreatePropertyInputSchema, UpdatePropertyInputSchema } from "../schemas";

describe("CreatePropertyInputSchema", () => {
  it("accepts valid minimal input", () => {
    const result = CreatePropertyInputSchema.safeParse({
      title: "阳光花园精装两居室",
      city: "北京",
      rental_type: "whole_unit",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing title", () => {
    const result = CreatePropertyInputSchema.safeParse({
      city: "北京",
      rental_type: "whole_unit",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing city", () => {
    const result = CreatePropertyInputSchema.safeParse({
      title: "Test",
      rental_type: "whole_unit",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing rental_type", () => {
    const result = CreatePropertyInputSchema.safeParse({
      title: "Test",
      city: "北京",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty title", () => {
    const result = CreatePropertyInputSchema.safeParse({
      title: "",
      city: "北京",
      rental_type: "whole_unit",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all optional fields with correct names (domain model §2.4)", () => {
    const result = CreatePropertyInputSchema.safeParse({
      title: "Test Property",
      city: "Shanghai",
      rental_type: "whole_unit",
      district: "Pudong",
      business_area: "Lujiazui",
      community_name: "Jinmao Tower",
      address_text: "Near the river",
      monthly_rent: 5000,
      deposit_terms: "押一付三",
      bedrooms: 2,
      living_rooms: 1,
      bathrooms: 1,
      area_sqm: 80.5,
      floor: 10,
      total_floors: 30,
      minimum_lease_months: 12,
      orientation: "朝南",
      decoration: "精装",
      available_from: "2026-09-01",
      has_elevator: true,
      pets_allowed: false,
      cooking_allowed: true,
      subway_text: "距3号线步行5分钟",
      tags: "近地铁, 精装修, 带阳台",
      selling_points: "采光好, 交通便利",
      drawbacks: "没有停车位",
      description: "A lovely apartment with great views",
      owner_name: "张房东",
      owner_phone: "13800138000",
      owner_wechat: "zhang_owner",
      exact_address: "浦东新区陆家嘴金茂大厦A座1201",
      key_location: "物业前台",
      internal_notes: "租客需提供工作证明",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.owner_name).toBe("张房东");
      expect(result.data.bedrooms).toBe(2);
      expect(result.data.cooking_allowed).toBe(true);
      expect(result.data.subway_text).toBe("距3号线步行5分钟");
      expect(result.data.business_area).toBe("Lujiazui");
    }
  });

  it("coerces numeric strings to numbers", () => {
    const result = CreatePropertyInputSchema.safeParse({
      title: "Test",
      city: "北京",
      rental_type: "whole_unit",
      monthly_rent: "5000",
      bedrooms: "3",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.monthly_rent).toBe(5000);
      expect(result.data.bedrooms).toBe(3);
    }
  });

  it("uses owner_* field names (not landlord_*)", () => {
    // domain model §2.5 uses owner_name, owner_phone, owner_wechat
    const result = CreatePropertyInputSchema.safeParse({
      title: "Test",
      city: "北京",
      rental_type: "whole_unit",
      owner_name: "李房东",
      owner_phone: "13900139000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.owner_name).toBe("李房东");
      // landlord_* should NOT exist on the type
      expect("landlord_name" in result.data).toBe(false);
    }
  });

  it("uses domain model column names: bedrooms not bedroom_count", () => {
    const result = CreatePropertyInputSchema.safeParse({
      title: "Test",
      city: "北京",
      rental_type: "whole_unit",
      bedrooms: 3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bedrooms).toBe(3);
    }
  });

  it("uses domain model column names: cooking_allowed not can_cook", () => {
    const result = CreatePropertyInputSchema.safeParse({
      title: "Test",
      city: "北京",
      rental_type: "whole_unit",
      cooking_allowed: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cooking_allowed).toBe(true);
    }
  });
});

describe("UpdatePropertyInputSchema", () => {
  it("accepts empty update (all fields optional)", () => {
    const result = UpdatePropertyInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update with status change", () => {
    const result = UpdatePropertyInputSchema.safeParse({
      status: "available",
      title: "Updated Title",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("available");
    }
  });

  it("rejects invalid status value", () => {
    const result = UpdatePropertyInputSchema.safeParse({
      status: "invalid_status",
    });
    expect(result.success).toBe(false);
  });

  it("accepts is_shared and allow_marketing_reuse as independent booleans", () => {
    const result = UpdatePropertyInputSchema.safeParse({
      is_shared: true,
      allow_marketing_reuse: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_shared).toBe(true);
      expect(result.data.allow_marketing_reuse).toBe(false);
    }
  });

  it("accepts owner_* field updates", () => {
    const result = UpdatePropertyInputSchema.safeParse({
      owner_name: "新房东",
      owner_phone: "13700137000",
    });
    expect(result.success).toBe(true);
  });

  it('coerces "true"/"false" strings to correct boolean values', () => {
    const result = UpdatePropertyInputSchema.safeParse({
      has_elevator: "true",
      cooking_allowed: "false",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // optionalBoolean() uses explicit truthy/falsy sets: "true" → true, "false" → false
      expect(result.data.has_elevator).toBe(true);
      expect(result.data.cooking_allowed).toBe(false);
    }
  });
});
