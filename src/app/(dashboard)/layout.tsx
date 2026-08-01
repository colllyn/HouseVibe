import { getAuthenticatedUser, getActiveWorkspaceCount } from "@/features/auth/session";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Dashboard route group layout.
 *
 * Auth guard:
 * 1. Validates the user's session via getUser() (not getSession())
 * 2. Checks active workspace memberships
 * 3. 0 active workspaces → redirect to /onboarding
 * 4. ≥1 active workspaces → render the dashboard shell
 *
 * Note: /onboarding lives OUTSIDE this route group (at src/app/onboarding/),
 * so the redirect here does NOT create an infinite loop.
 *
 * This layout is dynamically rendered (no caching of user-specific data).
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Verify the user is authenticated (throws redirect if not)
  await getAuthenticatedUser();

  // Check if the user has at least one active workspace
  const workspaceCount = await getActiveWorkspaceCount();

  if (workspaceCount === 0) {
    redirect("/onboarding");
  }

  return <AppShell>{children}</AppShell>;
}
