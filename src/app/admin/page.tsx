import { redirect } from "next/navigation";

/**
 * Admin root page — immediately redirects to /admin/users.
 *
 * The layout gate (requireSystemAdmin) already runs before this component,
 * so we only need to handle the redirect at this point.
 */
export default function AdminPage() {
  redirect("/admin/users");
}
