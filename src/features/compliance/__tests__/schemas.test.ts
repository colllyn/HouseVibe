// ============================================================
// Compliance Terms — Zod Schema Unit Tests
// Owner: test-engineer
// Contract: docs/contracts/domain-model.md §2.25
// ============================================================

import { describe, it, expect } from "vitest";
import {
  CreateComplianceTermSchema,
  UpdateComplianceTermSchema,
  COMPLIANCE_CATEGORIES,
  COMPLIANCE_SEVERITIES,
  MATCH_TYPES,
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  MATCH_TYPE_LABELS,
} from "../schemas";

describe("Compliance Terms Schemas", () => {
  // ============================================================
  // CreateComplianceTermSchema
  // ============================================================

  describe("CreateComplianceTermSchema", () => {
    it("accepts valid input", () => {
      const result = CreateComplianceTermSchema.safeParse({
        term: "第一",
        category: "absolute_claim",
        severity: "blocked",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid input with all optional fields", () => {
      const result = CreateComplianceTermSchema.safeParse({
        term: "投资回报率高达",
        category: "investment_promise",
        severity: "review",
        match_type: "contains",
        replacement_suggestion: "请使用客观描述",
      });
      expect(result.success).toBe(true);
    });

    it("defaults match_type to exact", () => {
      const result = CreateComplianceTermSchema.safeParse({
        term: "最低价",
        category: "price_qualification",
        severity: "highlight",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.match_type).toBe("exact");
      }
    });

    it("rejects empty term", () => {
      const result = CreateComplianceTermSchema.safeParse({
        term: "",
        category: "absolute_claim",
        severity: "blocked",
      });
      expect(result.success).toBe(false);
    });

    it("rejects term over 500 chars", () => {
      const result = CreateComplianceTermSchema.safeParse({
        term: "x".repeat(501),
        category: "absolute_claim",
        severity: "blocked",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid category", () => {
      const result = CreateComplianceTermSchema.safeParse({
        term: "测试",
        category: "invalid_category",
        severity: "blocked",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid severity", () => {
      const result = CreateComplianceTermSchema.safeParse({
        term: "测试",
        category: "absolute_claim",
        severity: "critical",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid match_type", () => {
      const result = CreateComplianceTermSchema.safeParse({
        term: "测试",
        category: "absolute_claim",
        severity: "review",
        match_type: "fuzzy",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing term", () => {
      const result = CreateComplianceTermSchema.safeParse({
        category: "absolute_claim",
        severity: "blocked",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing category", () => {
      const result = CreateComplianceTermSchema.safeParse({
        term: "测试",
        severity: "blocked",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing severity", () => {
      const result = CreateComplianceTermSchema.safeParse({
        term: "测试",
        category: "absolute_claim",
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================================
  // UpdateComplianceTermSchema
  // ============================================================

  describe("UpdateComplianceTermSchema", () => {
    it("accepts partial update with single field", () => {
      const result = UpdateComplianceTermSchema.safeParse({
        severity: "blocked",
      });
      expect(result.success).toBe(true);
    });

    it("accepts full update", () => {
      const result = UpdateComplianceTermSchema.safeParse({
        term: "更新词",
        category: "scarcity_urgency",
        severity: "review",
        match_type: "contains",
        replacement_suggestion: "建议",
        status: "disabled",
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty object (no changes)", () => {
      const result = UpdateComplianceTermSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects invalid severity in update", () => {
      const result = UpdateComplianceTermSchema.safeParse({
        severity: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("accepts null replacement_suggestion", () => {
      const result = UpdateComplianceTermSchema.safeParse({
        replacement_suggestion: null,
      });
      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // Constants
  // ============================================================

  describe("Constants", () => {
    it("has 10 categories", () => {
      expect(COMPLIANCE_CATEGORIES).toHaveLength(10);
    });

    it("has 3 severities", () => {
      expect(COMPLIANCE_SEVERITIES).toHaveLength(3);
    });

    it("has 3 match types", () => {
      expect(MATCH_TYPES).toHaveLength(3);
    });

    it("all categories have labels", () => {
      for (const c of COMPLIANCE_CATEGORIES) {
        expect(CATEGORY_LABELS[c]).toBeDefined();
        expect(typeof CATEGORY_LABELS[c]).toBe("string");
      }
    });

    it("all severities have labels", () => {
      for (const s of COMPLIANCE_SEVERITIES) {
        expect(SEVERITY_LABELS[s]).toBeDefined();
        expect(typeof SEVERITY_LABELS[s]).toBe("string");
      }
    });

    it("all match types have labels", () => {
      for (const m of MATCH_TYPES) {
        expect(MATCH_TYPE_LABELS[m]).toBeDefined();
        expect(typeof MATCH_TYPE_LABELS[m]).toBe("string");
      }
    });

    it("severities match compliance check module", () => {
      // blocked, review, highlight must be valid values
      expect(COMPLIANCE_SEVERITIES).toContain("blocked");
      expect(COMPLIANCE_SEVERITIES).toContain("review");
      expect(COMPLIANCE_SEVERITIES).toContain("highlight");
    });
  });
});
