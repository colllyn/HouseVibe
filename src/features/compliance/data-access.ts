// ============================================================
// Compliance Terms — Data Access Layer
// Owner: ai-deepseek-engineer
// ============================================================

import { createClient } from "@/lib/supabase/client";
import type {
  ComplianceTermRow,
  CreateComplianceTermInput,
  UpdateComplianceTermInput,
} from "./schemas";

// ============================================================
// Queries
// ============================================================

export async function fetchComplianceTerms(
  filters?: { status?: string; category?: string; search?: string }
): Promise<ComplianceTermRow[]> {
  const supabase = createClient();

  let query = supabase
    .from("compliance_terms")
    .select("*")
    .order("severity", { ascending: true })
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.category) {
    query = query.eq("category", filters.category);
  }
  if (filters?.search) {
    query = query.ilike("term", `%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as ComplianceTermRow[]) ?? [];
}

export async function fetchComplianceTermById(
  id: string
): Promise<ComplianceTermRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("compliance_terms")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as ComplianceTermRow;
}

// ============================================================
// Mutations
// ============================================================

export async function createComplianceTerm(
  input: CreateComplianceTermInput,
  userId: string
): Promise<ComplianceTermRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("compliance_terms")
    .insert({
      term: input.term,
      category: input.category,
      severity: input.severity,
      match_type: input.match_type ?? "exact",
      replacement_suggestion: input.replacement_suggestion ?? null,
      status: "active",
      version: 1,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ComplianceTermRow;
}

export async function updateComplianceTerm(
  id: string,
  input: UpdateComplianceTermInput
): Promise<ComplianceTermRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("compliance_terms")
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ComplianceTermRow;
}

export async function disableComplianceTerm(
  id: string
): Promise<ComplianceTermRow> {
  return updateComplianceTerm(id, { status: "disabled" });
}

export async function enableComplianceTerm(
  id: string
): Promise<ComplianceTermRow> {
  return updateComplianceTerm(id, { status: "active" });
}
