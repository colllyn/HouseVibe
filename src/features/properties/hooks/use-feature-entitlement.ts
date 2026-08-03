"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side hook that checks whether the current user holds a specific
 * feature entitlement by querying feature_entitlements via Supabase RLS.
 *
 * Users can read their own entitlements via existing RLS policy.
 * This hook re-checks on mount for immediate effect (no JWT expiry dependency).
 */
export function useFeatureEntitlement(feature: string): {
  entitled: boolean;
  loading: boolean;
  error: string | null;
} {
  const [entitled, setEntitled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function check() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) {
            setEntitled(false);
            setLoading(false);
          }
          return;
        }

        const { data } = await supabase
          .from("feature_entitlements")
          .select("id, expires_at")
          .eq("user_id", user.id)
          .eq("feature", feature)
          .eq("status", "active")
          .maybeSingle();

        if (cancelled) return;

        if (!data) {
          setEntitled(false);
        } else if (data.expires_at && new Date(data.expires_at) <= new Date()) {
          setEntitled(false);
        } else {
          setEntitled(true);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "权限检查失败");
          setEntitled(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [feature]);

  return { entitled, loading, error };
}
