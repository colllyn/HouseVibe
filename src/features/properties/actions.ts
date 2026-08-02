"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Property read-only query helpers.
 * All write operations (create/update/delete) go through Route Handlers
 * per API Contract: POST/PATCH/DELETE /api/properties.
 */

async function getUserWorkspaceId(): Promise<{ workspaceId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  const { data: member } = await supabase
    .from("workspace_members").select("workspace_id")
    .eq("user_id", user.id).eq("status", "active").limit(1).single();
  if (!member) throw new Error("无有效工作区");
  return { workspaceId: member.workspace_id };
}

export async function getPropertyById(propertyId: string) {
  try {
    const { workspaceId } = await getUserWorkspaceId();
    const supabase = await createClient();
    const { data: property } = await supabase
      .from("properties").select("*")
      .eq("id", propertyId).eq("workspace_id", workspaceId).is("deleted_at", null).single();
    if (!property) return null;
    const { data: pd } = await supabase
      .from("property_private_details").select("*")
      .eq("property_id", propertyId).eq("workspace_id", workspaceId).maybeSingle();
    return { ...property, private_details: pd ?? null };
  } catch { return null; }
}

export async function getProperties() {
  try {
    const { workspaceId } = await getUserWorkspaceId();
    const supabase = await createClient();
    const { data } = await supabase
      .from("properties").select("*")
      .eq("workspace_id", workspaceId).is("deleted_at", null)
      .order("updated_at", { ascending: false });
    return data ?? [];
  } catch { return []; }
}
