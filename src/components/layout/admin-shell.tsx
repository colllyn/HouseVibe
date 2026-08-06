"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  ShieldCheck,
  UserPlus,
  Home,
  Menu,
  X,
  LogOut,
  BarChart3,
  Cpu,
} from "lucide-react";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";
import { adminNavigation } from "@/config/admin-navigation";
import type { AdminNavItem } from "@/config/admin-navigation";
import { signOutAction } from "@/features/auth/actions";

// Map icon name strings to Lucide components
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Users,
  ShieldCheck,
  UserPlus,
  Home,
  BarChart3,
  Cpu,
};

function getIcon(name: string): React.ComponentType<{ className?: string }> {
  return iconMap[name] ?? Home;
}

export interface AdminShellProps {
  children: React.ReactNode;
}

function AdminNavLink({ item, isActive }: { item: AdminNavItem; isActive: boolean }) {
  const Icon = getIcon(item.icon);

  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2",
          "text-sm font-medium transition-colors",
          "min-h-[44px]",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          isActive
            ? "bg-secondary text-foreground"
            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
        )}
        aria-current={isActive ? "page" : undefined}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        <span>{item.label}</span>
      </Link>
    </li>
  );
}

function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden md:flex md:flex-col",
        "fixed inset-y-0 left-0 z-30",
        "w-56 border-r bg-background",
        "pt-[env(safe-area-inset-top,0px)]"
      )}
    >
      {/* Brand / Header */}
      <div className="flex h-14 items-center gap-2 px-4 border-b">
        <Home className="h-5 w-5 text-primary" />
        <span className="font-semibold text-sm">管理后台</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2" aria-label="管理导航">
        <ul className="space-y-1">
          {adminNavigation
            .sort((a, b) => a.order - b.order)
            .map((item) => (
              <AdminNavLink
                key={item.href}
                item={item}
                isActive={pathname === item.href}
              />
            ))}
        </ul>
      </nav>

      {/* User area */}
      <div className="border-t p-3 mb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground">
            <div className="h-7 w-7 rounded-full bg-muted" />
            <span className="truncate">管理员</span>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors min-h-[44px] min-w-[44px] justify-center"
              title="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function AdminMobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  return (
    <Drawer.Root open={open} onOpenChange={onClose} modal>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50",
            "flex flex-col",
            "rounded-t-[10px] border bg-background",
            "max-h-[92dvh]",
            "pt-[env(safe-area-inset-top,0px)]",
            "pb-[env(safe-area-inset-bottom,0px)]"
          )}
        >
          {/* Handle */}
          <div className="mx-auto mt-4 h-1.5 w-10 rounded-full bg-muted flex-shrink-0" />

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">管理后台</span>
            </div>
            <Drawer.Close
              className={cn(
                "rounded-md p-2",
                "min-h-[44px] min-w-[44px]",
                "inline-flex items-center justify-center",
                "hover:bg-muted transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-ring"
              )}
              aria-label="关闭菜单"
            >
              <X className="h-5 w-5" />
            </Drawer.Close>
          </div>

          {/* Navigation links */}
          <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="管理导航">
            <ul className="space-y-1">
              {adminNavigation
                .sort((a, b) => a.order - b.order)
                .map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-3",
                        "text-sm font-medium transition-colors",
                        "min-h-[44px]",
                        "focus:outline-none focus:ring-2 focus:ring-ring",
                        pathname === item.href
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                      )}
                      aria-current={
                        pathname === item.href ? "page" : undefined
                      }
                    >
                      {(() => {
                        const Icon = getIcon(item.icon);
                        return <Icon className="h-5 w-5 flex-shrink-0" />;
                      })()}
                      <span>{item.label}</span>
                    </Link>
                  </li>
                ))}
            </ul>

            {/* Sign out in drawer */}
            <div className="mt-4 pt-4 border-t">
              <form action={signOutAction}>
                <button
                  type="submit"
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-3 w-full",
                    "text-sm font-medium transition-colors",
                    "min-h-[44px]",
                    "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                    "focus:outline-none focus:ring-2 focus:ring-ring"
                  )}
                >
                  <LogOut className="h-5 w-5 flex-shrink-0" />
                  <span>退出登录</span>
                </button>
              </form>
            </div>
          </nav>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function AdminShell({ children }: AdminShellProps) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);

  return (
    <div className="min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <AdminSidebar />

      {/* Main content area */}
      <div className="md:pl-56">
        {/* Mobile top bar */}
        <header
          className={cn(
            "sticky top-0 z-20 md:hidden",
            "flex h-12 items-center justify-between px-4",
            "border-b bg-background",
            "pt-[env(safe-area-inset-top,0px)]"
          )}
        >
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className={cn(
              "inline-flex items-center justify-center rounded-md",
              "min-h-[44px] min-w-[44px]",
              "hover:bg-muted transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-ring",
              "-ml-2"
            )}
            aria-label="打开管理菜单"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">管理后台</span>
          </div>

          {/* Spacer for symmetry */}
          <div className="w-[44px]" aria-hidden="true" />
        </header>

        {/* Page content */}
        <main
          className={cn(
            "pb-16 md:pb-0",
            "pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:pb-0"
          )}
        >
          {children}
        </main>
      </div>

      {/* Mobile drawer navigation */}
      <AdminMobileDrawer
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
      />
    </div>
  );
}
