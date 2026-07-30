import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/config/env";

/**
 * Creates a Supabase client for use in Server Components and Route Handlers.
 *
 * Uses the anon key only. Service Role Key is NOT used here.
 *
 * The client is memoized per request via React `cache()` to avoid
 * creating multiple instances within a single request.
 *
 * No Auth redirects, middleware, or workspace permission logic here --
 * those are reserved for later phases.
 *
 * The Database type parameter is `any` for Phase 1-A; will be replaced
 * with the generated `Database` type once migrations are applied.
 */
export const createClient = cache(async (): Promise<SupabaseClient> => {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll was called from a Server Component.
            // This is expected when auth state changes during rendering.
            // Middleware handles the actual cookie persistence.
          }
        },
      },
    }
  );
});
