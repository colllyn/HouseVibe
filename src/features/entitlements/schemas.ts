import { z } from "zod";

/**
 * Feature keys matching the PostgreSQL feature_key enum.
 * Maps to public.feature_key: ai_data_extraction, semantic_search,
 * property_matching, shared_property_pool, content_factory.
 */
export const FeatureKeyEnum = z.enum([
  "ai_data_extraction",
  "semantic_search",
  "property_matching",
  "shared_property_pool",
  "content_factory",
]);
export type FeatureKey = z.infer<typeof FeatureKeyEnum>;

/**
 * Entitlement status as stored in feature_entitlements.status.
 */
export const EntitlementStatusEnum = z.enum(["active", "disabled", "revoked"]);
export type EntitlementStatus = z.infer<typeof EntitlementStatusEnum>;

/**
 * Input schema for granting a feature entitlement to a user.
 * The granting admin is determined server-side via getUser() — never from form data.
 */
export const GrantEntitlementInputSchema = z.object({
  userId: z.string().uuid("用户 ID 格式不正确"),
  feature: FeatureKeyEnum,
  expiresAt: z.string().datetime().nullable().optional(),
  reason: z.string().max(500, "备注最多 500 个字符").optional(),
});

/**
 * Input schema for revoking a feature entitlement.
 * The revoking admin is determined server-side via getUser().
 */
export const RevokeEntitlementInputSchema = z.object({
  userId: z.string().uuid("用户 ID 格式不正确"),
  feature: FeatureKeyEnum,
  reason: z.string().max(500, "备注最多 500 个字符").optional(),
});

/**
 * Input schema for disabling a feature entitlement.
 *
 * Disable differs from revoke: it sets status='disabled' without recording
 * revoked_by/revoked_at. This preserves the distinction between a temporary
 * suspension (disabled) and a permanent withdrawal (revoked).
 *
 * The disabling admin is determined server-side via getUser() — never from
 * form data.
 */
export const DisableEntitlementInputSchema = z.object({
  userId: z.string().uuid("无效的用户 ID"),
  feature: FeatureKeyEnum,
  reason: z.string().max(500, "原因最多 500 个字符").optional(),
});

/**
 * Input schema for granting system admin to a user.
 */
export const GrantSystemAdminInputSchema = z.object({
  userId: z.string().uuid("用户 ID 格式不正确"),
});

/**
 * Input schema for revoking system admin from a user.
 */
export const RevokeSystemAdminInputSchema = z.object({
  userId: z.string().uuid("用户 ID 格式不正确"),
});

// Inferred types
export type GrantEntitlementInput = z.infer<typeof GrantEntitlementInputSchema>;
export type RevokeEntitlementInput = z.infer<typeof RevokeEntitlementInputSchema>;
export type DisableEntitlementInput = z.infer<typeof DisableEntitlementInputSchema>;
export type GrantSystemAdminInput = z.infer<typeof GrantSystemAdminInputSchema>;
export type RevokeSystemAdminInput = z.infer<typeof RevokeSystemAdminInputSchema>;

/**
 * Admin user list row — safe fields only.
 * Never exposes auth metadata, phone numbers, or other sensitive fields.
 */
export interface AdminUserRow {
  id: string;
  email: string | null;
  fullName: string | null;
  workspaceCount: number;
  createdAt: string;
}
