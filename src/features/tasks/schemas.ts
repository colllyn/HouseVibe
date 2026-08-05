import { z } from "zod";

// --- Task Type Enum ---

export const TaskTypeEnum = z.enum([
  "contact_client",
  "send_property",
  "confirm_viewing",
  "follow_up_viewing",
  "update_property_status",
  "contact_owner",
  "publish_content",
  "update_content_data",
  "follow_up_collaboration",
]);

export type TaskType = z.infer<typeof TaskTypeEnum>;

// --- Task Status Enum ---

export const TaskStatusEnum = z.enum([
  "todo",
  "in_progress",
  "done",
  "cancelled",
]);

export type TaskStatus = z.infer<typeof TaskStatusEnum>;

// --- Task Type Labels ---

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  contact_client: "联系客户",
  send_property: "推送房源",
  confirm_viewing: "确认看房",
  follow_up_viewing: "跟进看房",
  update_property_status: "更新房源状态",
  contact_owner: "联系房东",
  publish_content: "发布内容",
  update_content_data: "更新内容数据",
  follow_up_collaboration: "跟进协作",
};

// --- Task Status Labels ---

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "待处理",
  in_progress: "处理中",
  done: "已完成",
  cancelled: "已取消",
};

// --- Create Schema ---

export const CreateTaskInputSchema = z.object({
  taskType: TaskTypeEnum,
  title: z.string().min(1, "任务标题不能为空").max(200, "标题最多 200 字"),
  description: z.string().max(500, "描述最多 500 字").optional(),
  propertyId: z.string().uuid("无效的房源 ID").optional(),
  clientId: z.string().uuid("无效的客户 ID").optional(),
  dueAt: z.string().optional(),
  contentProjectId: z.string().uuid().optional(),
  collaborationRequestId: z.string().uuid().optional(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

// --- Update Schema ---

export const UpdateTaskInputSchema = z.object({
  taskType: TaskTypeEnum.optional(),
  title: z.string().min(1, "任务标题不能为空").max(200, "标题最多 200 字").optional(),
  description: z
    .preprocess((v) => (v === "" ? null : v), z.string().max(500, "描述最多 500 字").optional().nullable()),
  propertyId: z.preprocess((v) => (v === "" ? null : v), z.string().uuid("无效的房源 ID").optional().nullable()),
  clientId: z.preprocess((v) => (v === "" ? null : v), z.string().uuid("无效的客户 ID").optional().nullable()),
  dueAt: z.preprocess((v) => (v === "" ? null : v), z.string().optional().nullable()),
  status: TaskStatusEnum.optional(),
  contentProjectId: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().optional().nullable()),
  collaborationRequestId: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().uuid().optional().nullable(),
  ),
}).refine(
  (d) => Object.keys(d).filter((k) => d[k as keyof typeof d] !== undefined).length > 0,
  { message: "至少需要一个更新字段" },
);

export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

// --- Query Schema ---

export const TaskSortByEnum = z.enum([
  "created_at",
  "updated_at",
  "due_at",
]);

export type TaskSortBy = z.infer<typeof TaskSortByEnum>;

export const TaskQuerySchema = z.object({
  status: TaskStatusEnum.optional(),
  taskType: TaskTypeEnum.optional(),
  assignedTo: z.string().uuid().optional(),
  dueBefore: z.string().optional(),
  dueAfter: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: TaskSortByEnum.default("created_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type TaskQuery = z.infer<typeof TaskQuerySchema>;
