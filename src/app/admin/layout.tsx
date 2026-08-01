import { isSystemAdmin } from "@/features/access-control/guards";
import { AdminShell } from "@/components/layout/admin-shell";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Admin layout: server-side auth guard + navigation shell.
 *
 * - Verifies the user is authenticated and a system admin
 * - Redirects non-admins to /dashboard with an access denied indicator
 * - Renders AdminShell (desktop sidebar + mobile drawer)
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // isSystemAdmin() checks auth.getUser() internally
  const admin = await isSystemAdmin();

  if (!admin) {
    redirect("/dashboard?error=access_denied");
  }

  return <AdminShell>{children}</AdminShell>;
}
