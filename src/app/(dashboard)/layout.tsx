import { getAuthenticatedUser, getActiveWorkspaceCount } from "@/features/auth/session";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { LoginRedirect } from "@/components/layout/login-redirect";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser();

  if (!user) {
    // Render a client component that redirects — avoids server-side
    // redirect() which interferes with Server Action/RH cookie propagation
    return <LoginRedirect />;
  }

  const workspaceCount = await getActiveWorkspaceCount();
  if (workspaceCount === 0) {
    redirect("/onboarding");
  }

  return <AppShell>{children}</AppShell>;
}
