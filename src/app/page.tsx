import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Root entry point — server-side redirect based on auth state.
 *
 * - Authenticated → /dashboard
 * - Unauthenticated → /login
 *
 * Uses the project's existing Supabase server auth helper (createClient).
 * No client-side useEffect, no cookie-length checks, no hardcoded user IDs.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  redirect("/login");
}
