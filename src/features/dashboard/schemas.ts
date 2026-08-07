import { z } from "zod";

// ============================================================
// Dashboard Schemas — PRD §7.2 (今日工作台)
// Owner: property-crm-engineer
// ============================================================

export const TaskStatSchema = z.object({
  total_pending: z.number().min(0),
  overdue_count: z.number().min(0),
  today_count: z.number().min(0),
}).strict();

export type TaskStat = z.infer<typeof TaskStatSchema>;

export const ClientStatSchema = z.object({
  total: z.number().min(0),
  need_follow_up: z.number().min(0),
  new_today: z.number().min(0),
}).strict();

export type ClientStat = z.infer<typeof ClientStatSchema>;

export const PropertyStatSchema = z.object({
  total: z.number().min(0),
  recent_count: z.number().min(0),
  available_soon: z.number().min(0),
}).strict();

export type PropertyStat = z.infer<typeof PropertyStatSchema>;

export const ContentStatSchema = z.object({
  recent_count: z.number().min(0),
  unpublished_count: z.number().min(0),
}).strict();

export type ContentStat = z.infer<typeof ContentStatSchema>;

export const DashboardDataSchema = z.object({
  tasks: TaskStatSchema,
  clients: ClientStatSchema,
  properties: PropertyStatSchema,
  content: ContentStatSchema.nullable(),
  isContentUser: z.boolean(),
}).strict();

export type DashboardData = z.infer<typeof DashboardDataSchema>;
