// ============================================================
// Content Projects Schemas — Unit Tests
// Owner: ai-deepseek-engineer
// Contract: P3-AI-021 (Content Tables Foundation)
// ============================================================

import { describe, expect, it } from "vitest";
import {
  CreateContentProjectSchema,
  UpdateContentProjectSchema,
  ContentProjectsQuerySchema,
  ContentProjectSchema,
  ContentPlatformEnum,
  ContentProjectStatusEnum,
} from "../schemas";

// ============================================================
// ContentPlatformEnum
// ============================================================

describe("ContentPlatformEnum", () => {
  it("accepts valid platforms", () => {
    expect(ContentPlatformEnum.safeParse("xiaohongshu").success).toBe(true);
    expect(ContentPlatformEnum.safeParse("douyin").success).toBe(true);
    expect(ContentPlatformEnum.safeParse("wechat_moments").success).toBe(true);
  });

  it("rejects invalid platform", () => {
    expect(ContentPlatformEnum.safeParse("instagram").success).toBe(false);
    expect(ContentPlatformEnum.safeParse("").success).toBe(false);
  });
});

// ============================================================
// ContentProjectStatusEnum
// ============================================================

describe("ContentProjectStatusEnum", () => {
  it("accepts valid statuses", () => {
    expect(ContentProjectStatusEnum.safeParse("draft").success).toBe(true);
    expect(ContentProjectStatusEnum.safeParse("ready").success).toBe(true);
    expect(ContentProjectStatusEnum.safeParse("published").success).toBe(true);
    expect(ContentProjectStatusEnum.safeParse("archived").success).toBe(true);
  });

  it("rejects invalid status", () => {
    expect(ContentProjectStatusEnum.safeParse("deleted").success).toBe(false);
  });
});

// ============================================================
// CreateContentProjectSchema
// ============================================================

describe("CreateContentProjectSchema", () => {
  it("accepts minimal valid input", () => {
    const result = CreateContentProjectSchema.safeParse({
      property_id: "b0000000-0000-0000-0000-000000000001",
      platform: "xiaohongshu",
    });
    expect(result.success).toBe(true);
  });

  it("accepts full valid input", () => {
    const result = CreateContentProjectSchema.safeParse({
      property_id: "b0000000-0000-0000-0000-000000000001",
      platform: "douyin",
      target_audience: "年轻白领",
      content_angle: "通勤便利",
      content_goal: "吸引咨询",
      tone: "亲切随和",
      video_duration_seconds: 60,
      is_on_camera: true,
      private_message_keyword: "看房666",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing property_id", () => {
    const result = CreateContentProjectSchema.safeParse({ platform: "xiaohongshu" });
    expect(result.success).toBe(false);
  });

  it("rejects missing platform", () => {
    const result = CreateContentProjectSchema.safeParse({
      property_id: "b0000000-0000-0000-0000-000000000001",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid property_id format", () => {
    const result = CreateContentProjectSchema.safeParse({
      property_id: "not-a-uuid",
      platform: "xiaohongshu",
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields (strict)", () => {
    const result = CreateContentProjectSchema.safeParse({
      property_id: "b0000000-0000-0000-0000-000000000001",
      platform: "xiaohongshu",
      extra: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects target_audience > 200 chars", () => {
    const result = CreateContentProjectSchema.safeParse({
      property_id: "b0000000-0000-0000-0000-000000000001",
      platform: "xiaohongshu",
      target_audience: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects video_duration_seconds > 600", () => {
    const result = CreateContentProjectSchema.safeParse({
      property_id: "b0000000-0000-0000-0000-000000000001",
      platform: "douyin",
      video_duration_seconds: 601,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// UpdateContentProjectSchema
// ============================================================

describe("UpdateContentProjectSchema", () => {
  it("accepts empty update (all fields optional)", () => {
    const result = UpdateContentProjectSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update", () => {
    const result = UpdateContentProjectSchema.safeParse({
      status: "ready",
      content_angle: "新角度",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null for nullable fields", () => {
    const result = UpdateContentProjectSchema.safeParse({
      target_audience: null,
      tone: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects extra fields", () => {
    const result = UpdateContentProjectSchema.safeParse({ extra: true });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// ContentProjectsQuerySchema
// ============================================================

describe("ContentProjectsQuerySchema", () => {
  it("uses defaults when empty", () => {
    const result = ContentProjectsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
      expect(result.data.offset).toBe(0);
    }
  });

  it("parses status and platform filters", () => {
    const result = ContentProjectsQuerySchema.safeParse({
      status: "draft",
      platform: "xiaohongshu",
      limit: "10",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("draft");
      expect(result.data.platform).toBe("xiaohongshu");
      expect(result.data.limit).toBe(10);
    }
  });

  it("rejects limit > 100", () => {
    const result = ContentProjectsQuerySchema.safeParse({ limit: "200" });
    expect(result.success).toBe(false);
  });

  it("rejects limit < 1", () => {
    const result = ContentProjectsQuerySchema.safeParse({ limit: "0" });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// ContentProjectSchema (response)
// ============================================================

describe("ContentProjectSchema", () => {
  const validProject = {
    id: "a0000000-0000-0000-0000-000000000001",
    workspace_id: "b0000000-0000-0000-0000-000000000001",
    property_id: "c0000000-0000-0000-0000-000000000001",
    created_by: "d0000000-0000-0000-0000-000000000001",
    platform: "xiaohongshu",
    target_audience: null,
    content_angle: null,
    content_goal: null,
    tone: null,
    video_duration_seconds: null,
    is_on_camera: false,
    status: "draft",
    private_message_keyword: null,
    created_at: "2026-08-06T10:00:00Z",
    updated_at: "2026-08-06T10:00:00Z",
    deleted_at: null,
  };

  it("accepts valid project", () => {
    const result = ContentProjectSchema.safeParse(validProject);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const { id: _id, ...rest } = validProject;
    const result = ContentProjectSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID id", () => {
    const result = ContentProjectSchema.safeParse({ ...validProject, id: "bad" });
    expect(result.success).toBe(false);
  });
});
