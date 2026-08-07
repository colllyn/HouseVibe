import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest, NextResponse } from "next/server";

const PROTECTED = ["/dashboard","/properties","/clients","/matches","/tasks","/settings","/admin","/collaboration-requests","/content","/publishing"];

function isProtected(pathname: string): boolean {
  return PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Refresh session (validates with Supabase Auth, updates cookies)
  const { response, user } = await updateSession(request);
  response.headers.set("Cache-Control", "private, no-store");

  if (isProtected(pathname)) {
    // Check actual validated user, not cookie length (P1-002)
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2)$).*)"],
};
