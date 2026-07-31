import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

/**
 * Next.js 15 Middleware
 *
 * Responsibilities (and ONLY these):
 * - Refresh Supabase session cookies
 * - Disable public caching for auth-sensitive responses
 *
 * Route protection and authorization decisions happen in:
 * - Layout components (src/app/(dashboard)/layout.tsx)
 * - Server Actions (src/features/auth/actions.ts)
 * - Database RLS policies
 *
 * This middleware does NOT:
 * - Query business data
 * - Check feature entitlements
 * - Execute complex authorization
 * - Use Service Role
 * - Call external AI services
 */
export async function middleware(request: NextRequest) {
  // Refresh the session (updates cookies if needed)
  const response = await updateSession(request);

  // Auth-sensitive responses must not be publicly cached
  response.headers.set("Cache-Control", "private, no-store");

  return response;
}

/**
 * Matcher: applies to all routes EXCEPT static assets.
 * - _next/static: Next.js static files
 * - _next/image: Next.js image optimization
 * - favicon.ico: browser favicon
 * - *.svg, *.png, *.jpg, *.jpeg, *.gif, *.webp: static images
 * - *.woff, *.woff2: fonts
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2)$).*)",
  ],
};
