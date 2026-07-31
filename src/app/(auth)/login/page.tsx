import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="w-full max-w-md">
      <Suspense fallback={
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
