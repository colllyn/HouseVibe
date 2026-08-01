import { getAuthenticatedUser } from "@/features/auth/session";
import { OnboardingForm } from "./onboarding-form";

/**
 * Standalone onboarding page (outside the (dashboard) route group).
 *
 * This page lives at /onboarding and has its own auth guard.
 * It is NOT wrapped by the (dashboard)/layout.tsx, so when that layout
 * redirects to /onboarding (workspaceCount === 0), the redirect lands
 * here without triggering the same layout check again — no infinite loop.
 */
export default async function OnboardingPage() {
  // Verify the user is authenticated
  await getAuthenticatedUser();

  return <OnboardingForm />;
}
