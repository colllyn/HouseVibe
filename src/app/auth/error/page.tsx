import Link from "next/link";

/**
 * Generic auth error page.
 * Does NOT expose internal error details or stack traces.
 */
export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="rounded-full bg-destructive/10 w-16 h-16 flex items-center justify-center mx-auto">
          <svg
            className="h-8 w-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">认证失败</h1>
          <p className="text-sm text-muted-foreground mt-2">
            登录链接已过期或无效，请重新登录。
          </p>
        </div>
        <Link
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary text-primary-foreground font-medium px-8 hover:bg-primary/90 transition-colors"
        >
          返回登录
        </Link>
      </div>
    </div>
  );
}
