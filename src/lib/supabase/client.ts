import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/config/env";

/**
 * Creates a Supabase client for use in browser (Client Components).
 *
 * Uses the anon key only. Service Role Key is never loaded.
 * No implicit global side effects -- each call creates a fresh client.
 *
 * The Database type parameter is `any` for Phase 1-A; will be replaced
 * with the generated `Database` type once migrations are applied.
 */
export function createClient(): SupabaseClient {
  const env = getPublicEnv();

  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
