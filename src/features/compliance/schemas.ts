// ============================================================
// Compliance Terms — Zod Schemas
// Owner: ai-deepseek-engineer
// Contract: docs/contracts/domain-model.md §2.25
// ============================================================

import { z } from "zod";

export const COMPLIANCE_CATEGORIES = [
  "absolute_claim",
  "investment_promise",
  "education_policy",
  "scarcity_urgency",
  "price_qualification",
  "discriminatory",
  "contact_leak",
  "address_leak",
  "fact_conflict",
  "illegal_content",
] as const;

export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  absolute_claim: "极限绝对化",
  investment_promise: "投资承诺",
  education_policy: "教育属性",
  scarcity_urgency: "稀缺催促",
  price_qualification: "价格资格",
  discriminatory: "歧视性内容",
  contact_leak: "联系方式泄露",
  address_leak: "地址泄露",
  fact_conflict: "事实冲突",
  illegal_content: "违规内容",
};

export const COMPLIANCE_SEVERITIES = ["blocked", "review", "highlight"] as const;
export type ComplianceSeverity = (typeof COMPLIANCE_SEVERITIES)[number];

export const SEVERITY_LABELS: Record<ComplianceSeverity, string> = {
  blocked: "阻断（必须删除）",
  review: "审核（人工确认）",
  highlight: "提示（仅高亮）",
};

export const MATCH_TYPES = ["exact", "contains", "regex"] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  exact: "精确匹配",
  contains: "包含匹配",
  regex: "正则表达式",
};

// ============================================================
// Create Schema
// ============================================================

export const CreateComplianceTermSchema = z.object({
  term: z.string().min(1, "风险词不能为空").max(500, "风险词不能超过500个字符"),
  category: z.enum(COMPLIANCE_CATEGORIES, {
    errorMap: () => ({ message: "请选择有效的风险类别" }),
  }),
  severity: z.enum(COMPLIANCE_SEVERITIES, {
    errorMap: () => ({ message: "请选择有效的严重级别" }),
  }),
  match_type: z.enum(MATCH_TYPES).default("exact"),
  replacement_suggestion: z.string().max(500).optional(),
});

export type CreateComplianceTermInput = z.infer<typeof CreateComplianceTermSchema>;

// ============================================================
// Update Schema
// ============================================================

export const UpdateComplianceTermSchema = z.object({
  term: z.string().min(1).max(500).optional(),
  category: z.enum(COMPLIANCE_CATEGORIES).optional(),
  severity: z.enum(COMPLIANCE_SEVERITIES).optional(),
  match_type: z.enum(MATCH_TYPES).optional(),
  replacement_suggestion: z.string().max(500).optional().nullable(),
  status: z.enum(["active", "disabled"]).optional(),
});

export type UpdateComplianceTermInput = z.infer<typeof UpdateComplianceTermSchema>;

// ============================================================
// Row type (what the DB returns)
// ============================================================

export interface ComplianceTermRow {
  id: string;
  term: string;
  category: ComplianceCategory;
  severity: ComplianceSeverity;
  match_type: MatchType;
  replacement_suggestion: string | null;
  status: "active" | "disabled";
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}
