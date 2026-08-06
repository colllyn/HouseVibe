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
