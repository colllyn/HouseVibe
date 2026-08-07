"use client";

import * as React from "react";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { DesktopSidebar } from "@/components/layout/desktop-sidebar";
import { TopBar } from "@/components/layout/top-bar";

export interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <DesktopSidebar />

      {/* Main content area */}
      <div className="md:pl-56">
        {/* Top bar */}
        <TopBar />

        {/* Page content */}
        <main className="pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileBottomNav />
    </div>
  );
}
