// ============================================================
// Content Projects — Zod Schemas
// Owner: ai-deepseek-engineer
// Contract: P3-AI-021 (Content Tables Foundation)
// ============================================================

import { z } from "zod";

// ============================================================
// Enums
// ============================================================

export const ContentPlatformEnum = z.enum([
  "xiaohongshu",
  "douyin",
  "wechat_moments",
]);
export type ContentPlatform = z.infer<typeof ContentPlatformEnum>;

export const ContentProjectStatusEnum = z.enum([
  "draft",
  "ready",
  "published",
  "archived",
]);
export type ContentProjectStatus = z.infer<typeof ContentProjectStatusEnum>;

export const ComplianceStatusEnum = z.enum([
  "clean",
  "review_required",
  "blocked",
]);
export type ComplianceStatus = z.infer<typeof ComplianceStatusEnum>;

// ============================================================
// Platform labels
// ============================================================

export const PLATFORM_LABELS: Record<ContentPlatform, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
  wechat_moments: "微信朋友圈",
};

export const STATUS_LABELS: Record<ContentProjectStatus, string> = {
  draft: "草稿",
  ready: "就绪",
  published: "已发布",
  archived: "已归档",
};

// ============================================================
// Content Project
// ============================================================

export const ContentProjectSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  property_id: z.string().uuid(),
  created_by: z.string().uuid(),
  platform: ContentPlatformEnum,
  target_audience: z.string().nullable(),
  content_angle: z.string().nullable(),
  content_goal: z.string().nullable(),
  tone: z.string().nullable(),
  video_duration_seconds: z.number().int().positive().nullable(),
  is_on_camera: z.boolean(),
  status: ContentProjectStatusEnum,
  private_message_keyword: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

export type ContentProject = z.infer<typeof ContentProjectSchema>;

// ============================================================
// Create Input
// ============================================================

export const CreateContentProjectSchema = z.object({
  property_id: z.string().uuid("请选择房源"),
  platform: ContentPlatformEnum,
  target_audience: z.string().max(200, "目标客群最多 200 字").optional(),
  content_angle: z.string().max(200, "内容角度最多 200 字").optional(),
  content_goal: z.string().max(200, "内容目标最多 200 字").optional(),
  tone: z.string().max(100, "语气最多 100 字").optional(),
  video_duration_seconds: z.number().int().positive().max(600, "视频时长最多 600 秒").nullable().optional(),
  is_on_camera: z.boolean().optional(),
  private_message_keyword: z.string().max(50, "私信口令最多 50 字").optional(),
}).strict();

export type CreateContentProjectInput = z.infer<typeof CreateContentProjectSchema>;

// ============================================================
// Update Input
// ============================================================

export const UpdateContentProjectSchema = z.object({
  platform: ContentPlatformEnum.optional(),
  target_audience: z.string().max(200).nullable().optional(),
  content_angle: z.string().max(200).nullable().optional(),
  content_goal: z.string().max(200).nullable().optional(),
  tone: z.string().max(100).nullable().optional(),
  video_duration_seconds: z.number().int().positive().max(600).nullable().optional(),
  is_on_camera: z.boolean().optional(),
  status: ContentProjectStatusEnum.optional(),
  private_message_keyword: z.string().max(50).nullable().optional(),
}).strict();

export type UpdateContentProjectInput = z.infer<typeof UpdateContentProjectSchema>;

// ============================================================
// Query params
// ============================================================

export const ContentProjectsQuerySchema = z.object({
  status: ContentProjectStatusEnum.optional(),
  platform: ContentPlatformEnum.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();

export type ContentProjectsQuery = z.infer<typeof ContentProjectsQuerySchema>;

// ============================================================
// List response
// ============================================================

export const ContentProjectListSchema = z.object({
  data: z.array(ContentProjectSchema),
  total: z.number().int().min(0),
  limit: z.number().int(),
  offset: z.number().int(),
});

// ============================================================
// Content Version
// ============================================================

export const ContentVersionSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  content_project_id: z.string().uuid(),
  version_number: z.number().int().positive(),
  model_provider: z.string(),
  model_name: z.string(),
  prompt_version: z.string(),
  input_snapshot: z.record(z.string(), z.unknown()),
  output_json: z.record(z.string(), z.unknown()),
  facts_used: z.array(z.unknown()),
  missing_information: z.array(z.unknown()),
  risk_flags: z.array(z.unknown()),
  compliance_status: ComplianceStatusEnum,
  compliance_flags: z.array(z.unknown()),
  feedback_score: z.number().int().min(-1).max(1).nullable(),
  feedback_type: z.string().nullable(),
  feedback_comment: z.string().nullable(),
  created_by: z.string().uuid(),
  created_at: z.string(),
});

export type ContentVersion = z.infer<typeof ContentVersionSchema>;

// ============================================================
// Create Content Version
// ============================================================

export const CreateContentVersionSchema = z.object({
  model_name: z.string().min(1),
  prompt_version: z.string().min(1),
  input_snapshot: z.record(z.string(), z.unknown()),
  output_json: z.record(z.string(), z.unknown()),
  facts_used: z.array(z.unknown()).optional(),
  missing_information: z.array(z.unknown()).optional(),
  risk_flags: z.array(z.unknown()).optional(),
  compliance_status: ComplianceStatusEnum.optional(),
  compliance_flags: z.array(z.unknown()).optional(),
}).strict();

export type CreateContentVersionInput = z.infer<typeof CreateContentVersionSchema>;

// ============================================================
// Update Content Version Feedback
// ============================================================

export const UpdateContentVersionFeedbackSchema = z.object({
  feedback_score: z.number().int().min(-1).max(1).optional(),
  feedback_type: z.string().max(50).optional(),
  feedback_comment: z.string().max(500).optional(),
}).strict();

export type UpdateContentVersionFeedbackInput = z.infer<typeof UpdateContentVersionFeedbackSchema>;

// ============================================================
// Publishing Record Schema (response)
// ============================================================

export const PublishingRecordSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  content_project_id: z.string().uuid(),
  content_version_id: z.string().uuid(),
  platform: ContentPlatformEnum,
  published_at: z.string(),
  post_url: z.string().nullable(),
  content_code: z.string().nullable(),
  private_message_keyword: z.string().nullable(),
  views: z.number().int().min(0),
  likes: z.number().int().min(0),
  favorites: z.number().int().min(0),
  comments: z.number().int().min(0),
  direct_messages: z.number().int().min(0),
  qualified_leads: z.number().int().min(0),
  viewings: z.number().int().min(0),
  deals: z.number().int().min(0),
  created_at: z.string(),
  updated_at: z.string(),
});

export type PublishingRecord = z.infer<typeof PublishingRecordSchema>;

// ============================================================
// Create Publishing Record
// ============================================================

export const CreatePublishingRecordSchema = z.object({
  content_version_id: z.string().uuid(),
  platform: ContentPlatformEnum,
  published_at: z.string().datetime({ message: "发布时间格式无效" }),
  post_url: z.string().url().optional().or(z.literal("")),
  content_code: z.string().max(200).optional(),
  private_message_keyword: z.string().max(200).optional(),
}).strict();

export type CreatePublishingRecordInput = z.infer<typeof CreatePublishingRecordSchema>;

// ============================================================
// Update Publishing Record (metrics + metadata)
// ============================================================

export const UpdatePublishingRecordSchema = z.object({
  post_url: z.string().url().optional().or(z.literal("")),
  content_code: z.string().max(200).optional(),
  private_message_keyword: z.string().max(200).optional(),
  views: z.number().int().min(0).optional(),
  likes: z.number().int().min(0).optional(),
  favorites: z.number().int().min(0).optional(),
  comments: z.number().int().min(0).optional(),
  direct_messages: z.number().int().min(0).optional(),
  qualified_leads: z.number().int().min(0).optional(),
  viewings: z.number().int().min(0).optional(),
  deals: z.number().int().min(0).optional(),
}).strict();

export type UpdatePublishingRecordInput = z.infer<typeof UpdatePublishingRecordSchema>;

// ============================================================
// Publishing Records Query
// ============================================================

export const PublishingRecordsQuerySchema = z.object({
  platform: ContentPlatformEnum.optional(),
  content_project_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PublishingRecordsQueryInput = z.infer<typeof PublishingRecordsQuerySchema>;
