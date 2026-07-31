import { createClient } from "@/lib/supabase/server";
import { AcceptInviteForm } from "@/features/auth/accept-invite-form";
import Link from "next/link";
import { LogIn } from "lucide-react";

/**
 * Invitation page at /join/[token].
 *
 * Behavior depends on authentication state:
 *
 * UNAUTHENTICATED: Shows a generic invitation prompt with a login button.
 * - Does NOT reveal workspace name, inviter, recipient email, or token validity.
 * - Login button redirects to /login?next=/join/<token>.
 *
 * AUTHENTICATED: Shows a confirmation card with an "Accept" button.
 * - Accept is a POST Server Action, never automatic on page load.
 * - On success: redirects to /dashboard.
 * - On error: generic message (no token probing).
 *
 * CRITICAL: Must NOT provide differentiated responses to anonymous users
 * that could be used for token probing/batch discovery.
 */

type Props = {
  params: Promise<{ token: string }>;
};

export default async function JoinPage({ params }: Props) {
  const { token } = await params;

  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unauthenticated: show generic invitation prompt
  if (!user) {
    const loginUrl = `/login?next=${encodeURIComponent(`/join/${token}`)}`;
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="rounded-full bg-primary/10 w-16 h-16 flex items-center justify-center mx-auto">
            <svg
              className="h-8 w-8 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">收到工作区邀请</h1>
            <p className="text-sm text-muted-foreground mt-2">
              您收到了一个工作区协作邀请。请登录后查看并接受邀请。
            </p>
          </div>
          <Link
            href={loginUrl}
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary text-primary-foreground font-medium px-8 hover:bg-primary/90 transition-colors"
          >
            <LogIn className="h-5 w-5 mr-2" />
            登录后接受邀请
          </Link>
          <p className="text-xs text-muted-foreground">
            还没有账号？
            <Link
              href={`/register?next=${encodeURIComponent(`/join/${token}`)}`}
              className="ml-1 text-primary hover:underline"
            >
              立即注册
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // Authenticated: show acceptance form
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="rounded-full bg-primary/10 w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <svg
              className="h-8 w-8 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">接受工作区邀请</h1>
          <p className="text-sm text-muted-foreground mt-2">
            您将以成员身份加入工作区。接受后即可访问工作区内的房源和客户数据。
          </p>
        </div>

        <AcceptInviteForm token={token} />

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/dashboard" className="text-primary hover:underline">
            返回工作台
          </Link>
        </p>
      </div>
    </div>
  );
}
