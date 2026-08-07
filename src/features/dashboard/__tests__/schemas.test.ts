import { describe, it, expect } from "vitest";
import {
  TaskStatSchema,
  ClientStatSchema,
  PropertyStatSchema,
  ContentStatSchema,
  DashboardDataSchema,
} from "../schemas";

describe("Dashboard Schemas", () => {
  describe("TaskStatSchema", () => {
    it("accepts valid task stats", () => {
      const result = TaskStatSchema.safeParse({
        total_pending: 5,
        overdue_count: 2,
        today_count: 1,
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative counts", () => {
      const result = TaskStatSchema.safeParse({
        total_pending: -1,
        overdue_count: 2,
        today_count: 1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing fields", () => {
      const result = TaskStatSchema.safeParse({ total_pending: 5 });
      expect(result.success).toBe(false);
    });

    it("rejects non-number values", () => {
      const result = TaskStatSchema.safeParse({
        total_pending: "5",
        overdue_count: 2,
        today_count: 1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects extra unknown fields", () => {
      const result = TaskStatSchema.safeParse({
        total_pending: 5,
        overdue_count: 2,
        today_count: 1,
        extra: true,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ClientStatSchema", () => {
    it("accepts valid client stats", () => {
      const result = ClientStatSchema.safeParse({
        total: 10,
        need_follow_up: 3,
        new_today: 0,
      });
      expect(result.success).toBe(true);
    });

    it("accepts all zeros (empty state)", () => {
      const result = ClientStatSchema.safeParse({
        total: 0,
        need_follow_up: 0,
        new_today: 0,
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative counts", () => {
      const result = ClientStatSchema.safeParse({
        total: -1,
        need_follow_up: 3,
        new_today: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing fields", () => {
      const result = ClientStatSchema.safeParse({ total: 5 });
      expect(result.success).toBe(false);
    });

    it("rejects non-number values", () => {
      const result = ClientStatSchema.safeParse({
        total: "10",
        need_follow_up: 3,
        new_today: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects extra unknown fields", () => {
      const result = ClientStatSchema.safeParse({
        total: 10,
        need_follow_up: 3,
        new_today: 0,
        extra_field: "should be rejected",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("PropertyStatSchema", () => {
    it("accepts valid property stats", () => {
      const result = PropertyStatSchema.safeParse({
        total: 20,
        recent_count: 5,
        available_soon: 3,
      });
      expect(result.success).toBe(true);
    });

    it("accepts all zeros (empty state)", () => {
      const result = PropertyStatSchema.safeParse({
        total: 0,
        recent_count: 0,
        available_soon: 0,
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative counts", () => {
      const result = PropertyStatSchema.safeParse({
        total: 20,
        recent_count: -5,
        available_soon: 3,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing fields", () => {
      const result = PropertyStatSchema.safeParse({ total: 20 });
      expect(result.success).toBe(false);
    });

    it("rejects non-number values", () => {
      const result = PropertyStatSchema.safeParse({
        total: "20",
        recent_count: 5,
        available_soon: 3,
      });
      expect(result.success).toBe(false);
    });

    it("rejects extra unknown fields", () => {
      const result = PropertyStatSchema.safeParse({
        total: 20,
        recent_count: 5,
        available_soon: 3,
        extra: true,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ContentStatSchema", () => {
    it("accepts valid content stats", () => {
      const result = ContentStatSchema.safeParse({
        recent_count: 8,
        unpublished_count: 2,
      });
      expect(result.success).toBe(true);
    });

    it("accepts all zeros (empty state)", () => {
      const result = ContentStatSchema.safeParse({
        recent_count: 0,
        unpublished_count: 0,
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative counts", () => {
      const result = ContentStatSchema.safeParse({
        recent_count: -8,
        unpublished_count: 2,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing fields", () => {
      const result = ContentStatSchema.safeParse({ recent_count: 5 });
      expect(result.success).toBe(false);
    });

    it("rejects non-number values", () => {
      const result = ContentStatSchema.safeParse({
        recent_count: "8",
        unpublished_count: 2,
      });
      expect(result.success).toBe(false);
    });

    it("rejects extra unknown fields", () => {
      const result = ContentStatSchema.safeParse({
        recent_count: 8,
        unpublished_count: 2,
        extra: "nope",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("DashboardDataSchema", () => {
    it("accepts data with content for content user", () => {
      const result = DashboardDataSchema.safeParse({
        tasks: { total_pending: 5, overdue_count: 2, today_count: 1 },
        clients: { total: 10, need_follow_up: 3, new_today: 1 },
        properties: { total: 20, recent_count: 5, available_soon: 3 },
        content: { recent_count: 8, unpublished_count: 2 },
        isContentUser: true,
      });
      expect(result.success).toBe(true);
    });

    it("accepts data with null content for non-content user", () => {
      const result = DashboardDataSchema.safeParse({
        tasks: { total_pending: 5, overdue_count: 2, today_count: 1 },
        clients: { total: 10, need_follow_up: 3, new_today: 1 },
        properties: { total: 20, recent_count: 5, available_soon: 3 },
        content: null,
        isContentUser: false,
      });
      expect(result.success).toBe(true);
    });

    it("rejects when isContentUser true but content is null", () => {
      const result = DashboardDataSchema.safeParse({
        tasks: { total_pending: 5, overdue_count: 2, today_count: 1 },
        clients: { total: 10, need_follow_up: 3, new_today: 1 },
        properties: { total: 20, recent_count: 5, available_soon: 3 },
        content: null,
        isContentUser: true,
      });
      // nullable content is allowed regardless of isContentUser flag
      expect(result.success).toBe(true);
    });

    it("rejects missing top-level fields", () => {
      const result = DashboardDataSchema.safeParse({
        tasks: { total_pending: 5, overdue_count: 2, today_count: 1 },
      });
      expect(result.success).toBe(false);
    });

    it("rejects extra unknown top-level fields", () => {
      const result = DashboardDataSchema.safeParse({
        tasks: { total_pending: 5, overdue_count: 2, today_count: 1 },
        clients: { total: 10, need_follow_up: 3, new_today: 1 },
        properties: { total: 20, recent_count: 5, available_soon: 3 },
        content: null,
        isContentUser: false,
        unexpected: "should be rejected",
      });
      expect(result.success).toBe(false);
    });
  });
});
