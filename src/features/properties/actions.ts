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

    // Fetch private details and media count in parallel
    const [{ data: pd }, { count: media_count }] = await Promise.all([
      supabase
        .from("property_private_details").select("*")
        .eq("property_id", propertyId).eq("workspace_id", workspaceId).maybeSingle(),
      supabase
        .from("property_media").select("*", { count: "exact", head: true })
        .eq("property_id", propertyId).is("deleted_at", null),
    ]);

    return { ...property, private_details: pd ?? null, media_count: media_count ?? 0 };
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

interface MediaRecord {
  id: string;
  property_id: string;
  storage_path: string;
  media_type: string;
  scene_tag: string | null;
  is_cover: boolean;
  sort_order: number;
  width: number | null;
  height: number | null;
  ai_labels: unknown;
  ai_analysis_status: string;
  created_at: string;
}

function signedUrlExpiry(): number {
  return parseInt(process.env.MEDIA_SIGNED_URL_EXPIRY_SECONDS || "3600", 10);
}

/**
 * Client read-only query helpers.
 * All write operations (create/update/delete) go through Route Handlers
 * per API Contract: POST/PATCH/DELETE /api/clients.
 */

// List columns — excludes phone and wechat (sensitive).
const CLIENT_LIST_COLS = "id,workspace_id,created_by,name,source_platform,source_content_id,first_property_id,budget_min,budget_max,preferred_districts,preferred_communities,bedrooms,rental_type,available_from,minimum_lease_months,pets_required,cooking_required,commute_destination,hard_requirements,soft_preferences,deal_breakers,stage,raw_input_text,next_follow_up_at,last_interaction_at,created_at,updated_at,deleted_at";

export async function getClientById(clientId: string) {
  try {
    const { workspaceId } = await getUserWorkspaceId();
    const supabase = await createClient();
    const { data: client } = await supabase
      .from("clients").select("*")
      .eq("id", clientId).eq("workspace_id", workspaceId).is("deleted_at", null).single();
    return client ?? null;
  } catch { return null; }
}

export async function getClients() {
  try {
    const { workspaceId } = await getUserWorkspaceId();
    const supabase = await createClient();
    const { data } = await supabase
      .from("clients").select(CLIENT_LIST_COLS)
      .eq("workspace_id", workspaceId).is("deleted_at", null)
      .order("updated_at", { ascending: false });
    return data ?? [];
  } catch { return []; }
}

export async function getPropertyMedia(propertyId: string) {
  try {
    const { workspaceId } = await getUserWorkspaceId();
    const supabase = await createClient();

    const { data: property } = await supabase
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();
    if (!property) return [];

    const { data: media } = await supabase
      .from("property_media")
      .select("*")
      .eq("property_id", propertyId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (!media || media.length === 0) return [];

    const expiry = signedUrlExpiry();
    const expiresAt = new Date(Date.now() + expiry * 1000).toISOString();

    const results = await Promise.all(
      (media as MediaRecord[]).map(async (m) => {
        const { data: signedData } = await supabase.storage
          .from("property-private")
          .createSignedUrl(m.storage_path, expiry);

        return {
          id: m.id,
          propertyId: m.property_id,
          storagePath: m.storage_path,
          mediaType: m.media_type,
          sceneTag: m.scene_tag,
          isCover: m.is_cover,
          sortOrder: m.sort_order,
          width: m.width,
          height: m.height,
          aiLabels: m.ai_labels,
          aiAnalysisStatus: m.ai_analysis_status,
          signedUrl: signedData?.signedUrl ?? null,
          signedUrlExpiresAt: expiresAt,
          createdAt: m.created_at,
        };
      }),
    );

    return results;
  } catch {
    return [];
  }
}
