/**
 * Route Handler Supabase Client
 * Binds cookies to NextRequest. Returns a helper that builds
 * the final Response with all pending cookies included.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/config/env";

export async function createRouteHandlerClient(request: NextRequest) {
  const env = getPublicEnv();
  const pendingCookies: { name: string; value: string; options: Record<string, unknown> }[] = [];

  const client = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            pendingCookies.push({
              name,
              value,
              options: options as Record<string, unknown>,
            });
            request.cookies.set(name, value);
          });
        },
      },
    }
  );

  /** Build a final Response with pending cookies + given body/status/headers */
  function jsonResponse(
    body: unknown,
    init?: { status?: number; headers?: Record<string, string> }
  ): NextResponse {
    const res = NextResponse.json(body, init);
    for (const c of pendingCookies) {
      res.cookies.set(c.name, c.value, c.options);
    }
    return res;
  }

  return { client, jsonResponse };
}
