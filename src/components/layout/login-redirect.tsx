"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Client-side login redirect.
 * Middleware handles initial protection; this is a fallback for
 * cases where the layout detects no user after middleware passes.
 */
export function LoginRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const params = new URLSearchParams();
    if (pathname && pathname !== "/") params.set("next", pathname);
    const qs = params.toString();
    router.replace(`/login${qs ? `?${qs}` : ""}`);
  }, [router, pathname]);

  return null;
}
