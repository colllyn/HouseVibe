/**
 * AI User Preferences — List API
 * P3-AI-013
 *
 * GET /api/me/ai-preferences
 * Returns the authenticated user's active AI preferences.
 *
 * Auth: required
 * Workspace: required (derived from user's active membership)
 * Entitlement: any authenticated user (preferences are personal)
 */

import { type NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { listPreferences } from "@/features/ai-preferences/preference-engine";

// ============================================================
// Helpers
// ============================================================

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    "localhost";
  return `${proto}://${host}`;
}

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Credentials": "true",
});

// ============================================================
// GET /api/me/ai-preferences
// ============================================================

export async function GET(request: NextRequest) {
  const origin = urlOrigin(request);
  const h = corsHeaders(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // 1. Auth
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      return jsonResponse(
        { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
        { status: 401, headers: h },
      );
    }

    // 2. Workspace membership
    const { data: member } = await client
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();
    if (!member) {
      return jsonResponse(
        {
          data: null,
          error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" },
        },
        { status: 403, headers: h },
      );
    }

    // 3. List preferences
    const preferences = await listPreferences(client, user.id);

    return jsonResponse(
      { data: preferences, error: null },
      { status: 200, headers: h },
    );
  } catch {
    return jsonResponse(
      {
        data: null,
        error: { code: "INTERNAL_ERROR", message: "服务器错误" },
      },
      { status: 500, headers: h },
    );
  }
}
