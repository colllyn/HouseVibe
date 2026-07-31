import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/config/env";

/**
 * Refreshes the Supabase session and returns a response with updated cookies.
 * Used by src/middleware.ts for session refresh on every request.
 *
 * - Creates a request-scoped Supabase client
 * - Reads request cookies, refreshes session
 * - Writes updated cookies to BOTH request and response
 * - Preserves Supabase cookie options
 * - Uses getUser() (validates with auth server) not getSession()
 */
export async function updateSession(request: NextRequest) {
  const env = getPublicEnv();

  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Update the request cookies so subsequent server reads get the refreshed value
            request.cookies.set(name, value);
            // Update the response cookies so the browser receives the refreshed value
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh the session by validating the user — this also refreshes the token if needed.
  // We use getUser() which makes a call to the Supabase Auth server to validate.
  // This is the recommended approach; getSession() only reads the local JWT.
  await supabase.auth.getUser();

  return response;
}
