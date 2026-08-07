"use server";

import { createClient } from "@/lib/supabase/server";
import { hasFeature } from "@/features/access-control/guards";
import type { DashboardData, TaskStat, ClientStat, PropertyStat, ContentStat } from "./schemas";

// ============================================================
// Dashboard Data Aggregation — PRD §7.2 (今日工作台)
// Owner: property-crm-engineer
//
// Gathers workspace-scoped stats for the dashboard.
// Content stats are only fetched for content_factory users.
// ============================================================

async function getWorkspaceContext(): Promise<{ userId: string; workspaceId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!member) throw new Error("无有效工作区");

  return { userId: user.id, workspaceId: member.workspace_id };
}

function todayRange(): { todayStart: string; todayEnd: string } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return { todayStart, todayEnd };
}

/** Date-only string in YYYY-MM-DD format for date column comparisons */
function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchTaskStats(workspaceId: string): Promise<TaskStat> {
  const supabase = await createClient();
  const { todayStart, todayEnd } = todayRange();

  // Total pending tasks: active status only (exclude completed and cancelled)
  const { count: total_pending } = await supabase
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .in("status", ["todo", "in_progress"]);

  // Overdue: due_at < now, active status only
  const now = new Date().toISOString();
  const { count: overdue_count } = await supabase
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .in("status", ["todo", "in_progress"])
    .lt("due_at", now);

  // Created today
  const { count: today_count } = await supabase
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .gte("created_at", todayStart)
    .lt("created_at", todayEnd);

  return {
    total_pending: total_pending ?? 0,
    overdue_count: overdue_count ?? 0,
    today_count: today_count ?? 0,
  };
}

async function fetchClientStats(workspaceId: string): Promise<ClientStat> {
  const supabase = await createClient();
  const { todayStart, todayEnd } = todayRange();
  const now = new Date().toISOString();

  // Total active clients
  const { count: total } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  // Need follow-up: next_follow_up_at <= now, not archived
  const { count: need_follow_up } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .lte("next_follow_up_at", now)
    .neq("stage", "archived");

  // New today
  const { count: new_today } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .gte("created_at", todayStart)
    .lt("created_at", todayEnd);

  return {
    total: total ?? 0,
    need_follow_up: need_follow_up ?? 0,
    new_today: new_today ?? 0,
  };
}

async function fetchPropertyStats(workspaceId: string): Promise<PropertyStat> {
  const supabase = await createClient();

  // Total active properties
  const { count: total } = await supabase
    .from("properties")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .neq("status", "deleted");

  // Recent (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: recent_count } = await supabase
    .from("properties")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .gte("created_at", sevenDaysAgo);

  // Available soon: available_from is a `date` column — use date-only strings
  // to avoid timestamptz→date casting issues that exclude today's date.
  const now = new Date();
  const todayStr = dateStr(now);
  const thirtyDaysStr = dateStr(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const { count: available_soon } = await supabase
    .from("properties")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "available")
    .is("deleted_at", null)
    .gte("available_from", todayStr)
    .lte("available_from", thirtyDaysStr);

  return {
    total: total ?? 0,
    recent_count: recent_count ?? 0,
    available_soon: available_soon ?? 0,
  };
}

async function fetchContentStats(workspaceId: string): Promise<ContentStat | null> {
  try {
    const entitled = await hasFeature("content_factory");
    if (!entitled) return null;

    const supabase = await createClient();

    // Recent content projects (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recent_count } = await supabase
      .from("content_projects")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .gte("created_at", thirtyDaysAgo);

    // Unpublished: content versions in draft status
    const { count: unpublished_count } = await supabase
      .from("content_versions")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "draft");

    return {
      recent_count: recent_count ?? 0,
      unpublished_count: unpublished_count ?? 0,
    };
  } catch (err) {
    // Log the error for debugging but return null so the dashboard
    // still loads for non-content users. The isContentUser flag is
    // already determined by hasFeature, so a transient DB error here
    // should not permanently hide content stats.
    console.error("[dashboard] fetchContentStats failed:", err);
    return null;
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const { workspaceId } = await getWorkspaceContext();

  const [tasks, clients, properties, content] = await Promise.all([
    fetchTaskStats(workspaceId),
    fetchClientStats(workspaceId),
    fetchPropertyStats(workspaceId),
    fetchContentStats(workspaceId),
  ]);

  return {
    tasks,
    clients,
    properties,
    content,
    isContentUser: content !== null,
  };
}
