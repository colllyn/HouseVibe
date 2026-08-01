"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Users,
  Settings,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

const navItems: NavItem[] = [
  { label: "工作台", href: "/dashboard", icon: LayoutDashboard },
  { label: "首页", href: "/", icon: Home },
  { label: "房源", href: "/properties", icon: Building2, disabled: true },
  { label: "客户", href: "/clients", icon: Users, disabled: true },
  { label: "设置", href: "/settings/profile", icon: Settings },
];

function DisabledBadge() {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-auto rounded-full px-1.5 py-0.5",
        "bg-muted text-muted-foreground",
        "text-[9px] leading-none font-medium"
      )}
    >
      即将开放
    </span>
  );
}

export function DesktopSidebar() {
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
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 px-4 border-b">
        <Home className="h-5 w-5 text-primary" />
        <span className="font-semibold text-sm">阳光智家</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2" aria-label="主导航">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;

            if (item.disabled) {
              return (
                <li key={item.href}>
                  <span
                    aria-disabled="true"
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2",
                      "text-sm font-medium",
                      "min-h-[44px]",
                      "text-muted-foreground/40 cursor-default select-none"
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span>{item.label}</span>
                    <DisabledBadge />
                  </span>
                </li>
              );
            }

            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
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
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User area placeholder */}
      <div className="border-t p-3">
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground">
          <div className="h-7 w-7 rounded-full bg-muted" />
          <span className="truncate">未登录</span>
        </div>
      </div>
    </aside>
  );
}
