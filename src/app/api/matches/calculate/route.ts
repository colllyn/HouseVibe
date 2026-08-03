/**
 * POST /api/matches/calculate
 * Calculate matches for a client against specified (or all available) properties.
 * Requires: property_matching entitlement.
 */

import type { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { hasFeature } from "@/features/access-control/guards";
import { CalculateMatchInputSchema } from "@/features/matching/schemas";
import { calculateMatches } from "@/features/matching/rule-engine";
import type { ClientRecord, PropertyRecord } from "@/features/matching/rule-engine";

function urlOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
const cors = (o: string) => ({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" });

export async function POST(request: NextRequest) {
  const origin = urlOrigin(request);
  const h = cors(origin);
  const { client, jsonResponse } = await createRouteHandlerClient(request);

  try {
    // 1. Auth
    const { data: { user } } = await client.auth.getUser();
    if (!user)
      return jsonResponse(
        { data: null, error: { code: "UNAUTHENTICATED", message: "未登录" } },
        { status: 401, headers: h }
      );

    // 2. Workspace membership
    const { data: member } = await client
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();
    if (!member)
      return jsonResponse(
        { data: null, error: { code: "WORKSPACE_ACCESS_DENIED", message: "无权限" } },
        { status: 403, headers: h }
      );

    const workspaceId = member.workspace_id;

    // 3. Entitlement check (must use hasFeature for route handlers)
    const entitled = await hasFeature("property_matching");
    if (!entitled)
      return jsonResponse(
        { data: null, error: { code: "FEATURE_NOT_ALLOWED", message: "需要 property_matching 权限" } },
        { status: 403, headers: h }
      );

    // 4. Parse body
    const body = await request.json();
    const parsed = CalculateMatchInputSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first
        ? `${first.path.join(".")}: ${first.message}`
        : "请求参数无效";
      return jsonResponse(
        { data: null, error: { code: "VALIDATION_FAILED", message: msg } },
        { status: 422, headers: h }
      );
    }

    const { clientId, propertyIds, weightOverrides } = parsed.data;

    // 5. Fetch client (workspace-scoped, not soft-deleted)
    const { data: clientRow, error: clientErr } = await client
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .single();

    if (clientErr || !clientRow) {
      return jsonResponse(
        { data: null, error: { code: "RESOURCE_NOT_FOUND", message: "客户不存在" } },
        { status: 404, headers: h }
      );
    }

    // 6. Fetch properties (workspace-scoped, status='available', not soft-deleted)
    let propertyQuery = client
      .from("properties")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "available")
      .is("deleted_at", null);

    if (propertyIds && propertyIds.length > 0) {
      propertyQuery = propertyQuery.in("id", propertyIds);
    }

    const { data: properties, error: propErr } = await propertyQuery;

    if (propErr || !properties) {
      return jsonResponse(
        { data: null, error: { code: "INTERNAL_ERROR", message: "查询房源失败" } },
        { status: 500, headers: h }
      );
    }

    // 7. Run deterministic rule engine
    const results = calculateMatches(
      clientRow as unknown as ClientRecord,
      properties as unknown as PropertyRecord[],
      weightOverrides,
    );

    const matchedCount = results.filter((r) => r.score > 0).length;

    // 8. Persist matches via upsert RPC (for matches that passed hard filters)
    const persistedMatches = [];
    const persistedPropertyIds = new Set<string>();
    for (const result of results) {
      if (result.score > 0) {
        // Only persist matches that passed hard filters
        const { error: rpcErr } = await client.rpc("upsert_property_match", {
          p_client_id: clientId,
          p_property_id: result.propertyId,
          p_score: result.score,
          p_match_level: result.matchLevel,
          p_matched_reasons: result.matchedReasons,
          p_unmatched_reasons: result.unmatchedReasons,
          p_needs_confirmation: result.needsConfirmation,
          p_status: "active",
        });
        if (!rpcErr) {
          persistedMatches.push(result);
          persistedPropertyIds.add(result.propertyId);
        }
      }
    }

    // 9. Archive previously-persisted matches that now fail hard filters (contract §6)
    // Find all existing non-archived matches for this client
    const { data: existingMatches } = await client
      .from("property_matches")
      .select("id, property_id, status")
      .eq("client_id", clientId)
      .neq("status", "archived");

    if (existingMatches && Array.isArray(existingMatches)) {
      for (const existing of existingMatches as Array<{ id: string; property_id: string; status: string }>) {
        // If the property is in the current result set with score > 0, it was (or will be) handled
        // by the upsert above. Check if the result for this property failed hard filters (score=0)
        // or the property was not in the calculation scope at all.
        const currentResult = results.find((r) => r.propertyId === existing.property_id);

        if (!currentResult || currentResult.score === 0) {
          // Property is no longer a valid match → archive it per contract §6
          try {
            await client.rpc("update_match_status", {
              p_match_id: existing.id,
              p_new_status: "archived",
            });
          } catch {
            // Best-effort archiving; don't fail the whole request
          }
        }
      }
    }

    return jsonResponse(
      {
        data: {
          matches: results,
          totalProperties: properties.length,
          matchedCount,
        },
        error: null,
      },
      { status: 201, headers: h }
    );
  } catch {
    return jsonResponse(
      { data: null, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: h }
    );
  }
}
