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
  ContentVersionSchema,
  CreateContentVersionSchema,
  UpdateContentVersionFeedbackSchema,
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

// ============================================================
// ContentVersionSchema
// ============================================================

describe("ContentVersionSchema", () => {
  const validVersion = {
    id: "e0000000-0000-0000-0000-000000000001",
    workspace_id: "b0000000-0000-0000-0000-000000000001",
    content_project_id: "a0000000-0000-0000-0000-000000000001",
    version_number: 1,
    model_provider: "deepseek",
    model_name: "deepseek-v4-pro",
    prompt_version: "1.0.0",
    input_snapshot: { platform: "xiaohongshu" },
    output_json: { body: "test content" },
    facts_used: [],
    missing_information: [],
    risk_flags: [],
    compliance_status: "clean",
    compliance_flags: [],
    feedback_score: null,
    feedback_type: null,
    feedback_comment: null,
    created_by: "d0000000-0000-0000-0000-000000000001",
    created_at: "2026-08-06T10:00:00Z",
  };

  it("accepts valid version", () => {
    const result = ContentVersionSchema.safeParse(validVersion);
    expect(result.success).toBe(true);
  });

  it("rejects missing model_name", () => {
    const { model_name: _mn, ...rest } = validVersion;
    const result = ContentVersionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID id", () => {
    const result = ContentVersionSchema.safeParse({ ...validVersion, id: "bad" });
    expect(result.success).toBe(false);
  });

  it("rejects feedback_score out of range (2)", () => {
    const result = ContentVersionSchema.safeParse({ ...validVersion, feedback_score: 2 });
    expect(result.success).toBe(false);
  });

  it("rejects feedback_score out of range (-2)", () => {
    const result = ContentVersionSchema.safeParse({ ...validVersion, feedback_score: -2 });
    expect(result.success).toBe(false);
  });

  it("accepts valid feedback_score (-1, 0, 1)", () => {
    expect(ContentVersionSchema.safeParse({ ...validVersion, feedback_score: -1 }).success).toBe(true);
    expect(ContentVersionSchema.safeParse({ ...validVersion, feedback_score: 0 }).success).toBe(true);
    expect(ContentVersionSchema.safeParse({ ...validVersion, feedback_score: 1 }).success).toBe(true);
  });

  it("accepts null feedback fields", () => {
    const result = ContentVersionSchema.safeParse({
      ...validVersion,
      feedback_score: null,
      feedback_type: null,
      feedback_comment: null,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// CreateContentVersionSchema
// ============================================================

describe("CreateContentVersionSchema", () => {
  const validInput = {
    model_name: "deepseek-v4-pro",
    prompt_version: "1.0.0",
    input_snapshot: { platform: "xiaohongshu" },
    output_json: { body: "test" },
  };

  it("accepts minimal valid input", () => {
    const result = CreateContentVersionSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts with optional fields", () => {
    const result = CreateContentVersionSchema.safeParse({
      ...validInput,
      facts_used: [{ claim: "test" }],
      missing_information: ["info"],
      risk_flags: [{ type: "risk" }],
      compliance_status: "review_required",
      compliance_flags: [{ flag: "test" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty model_name", () => {
    const result = CreateContentVersionSchema.safeParse({ ...validInput, model_name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing model_name", () => {
    const { model_name: _mn, ...rest } = validInput;
    const result = CreateContentVersionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing prompt_version", () => {
    const { prompt_version: _pv, ...rest } = validInput;
    const result = CreateContentVersionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing input_snapshot", () => {
    const { input_snapshot: _is, ...rest } = validInput;
    const result = CreateContentVersionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing output_json", () => {
    const { output_json: _oj, ...rest } = validInput;
    const result = CreateContentVersionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects extra fields (strict)", () => {
    const result = CreateContentVersionSchema.safeParse({
      ...validInput,
      workspace_id: "fake",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid compliance_status", () => {
    const result = CreateContentVersionSchema.safeParse({
      ...validInput,
      compliance_status: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid compliance_status values", () => {
    expect(CreateContentVersionSchema.safeParse({ ...validInput, compliance_status: "clean" }).success).toBe(true);
    expect(CreateContentVersionSchema.safeParse({ ...validInput, compliance_status: "review_required" }).success).toBe(true);
    expect(CreateContentVersionSchema.safeParse({ ...validInput, compliance_status: "blocked" }).success).toBe(true);
  });
});

// ============================================================
// UpdateContentVersionFeedbackSchema
// ============================================================

describe("UpdateContentVersionFeedbackSchema", () => {
  it("accepts valid feedback with all fields", () => {
    const result = UpdateContentVersionFeedbackSchema.safeParse({
      feedback_score: 1,
      feedback_type: "positive",
      feedback_comment: "Great content!",
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial feedback (score only)", () => {
    const result = UpdateContentVersionFeedbackSchema.safeParse({ feedback_score: -1 });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (all optional)", () => {
    const result = UpdateContentVersionFeedbackSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects feedback_score out of range (2)", () => {
    const result = UpdateContentVersionFeedbackSchema.safeParse({ feedback_score: 2 });
    expect(result.success).toBe(false);
  });

  it("rejects feedback_score out of range (-2)", () => {
    const result = UpdateContentVersionFeedbackSchema.safeParse({ feedback_score: -2 });
    expect(result.success).toBe(false);
  });

  it("rejects feedback_comment over 500 chars", () => {
    const result = UpdateContentVersionFeedbackSchema.safeParse({
      feedback_comment: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts feedback_comment at 500 chars", () => {
    const result = UpdateContentVersionFeedbackSchema.safeParse({
      feedback_comment: "a".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("rejects feedback_type over 50 chars", () => {
    const result = UpdateContentVersionFeedbackSchema.safeParse({
      feedback_type: "a".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields (strict)", () => {
    const result = UpdateContentVersionFeedbackSchema.safeParse({
      feedback_score: 1,
      extra_field: "should not be here",
    });
    expect(result.success).toBe(false);
  });
});
