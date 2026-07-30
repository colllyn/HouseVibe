"use client";

import * as React from "react";
import { Home } from "lucide-react";
import { cn } from "@/lib/utils";

export function TopBar() {
  return (
    <header
      className={cn(
        "sticky top-0 z-20",
        "flex h-12 items-center justify-between px-4",
        "border-b bg-background",
        "pt-[env(safe-area-inset-top,0px)]"
      )}
    >
      {/* Left: Mobile brand / Desktop nothing (sidebar has brand) */}
      <div className="flex items-center gap-2 md:hidden">
        <Home className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">阳光智家</span>
      </div>

      {/* Right: User area placeholder */}
      <div className="flex items-center gap-2 md:ml-auto">
        <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-7 w-7 rounded-full bg-muted" />
          <span>用户</span>
        </div>
      </div>
    </header>
  );
}
