import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeNextPath } from "@/features/auth/redirects";

/**
 * Auth Callback Route Handler
 *
 * Handles the OAuth/email confirmation callback from Supabase Auth.
 * Exchanges the `code` parameter for a session via PKCE.
 *
 * GET /auth/callback?code=xxx&next=/dashboard
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = getSafeNextPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/auth/error", request.url));
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/auth/error", request.url));
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  response.headers.set("Cache-Control", "private, no-store");

  return response;
}
