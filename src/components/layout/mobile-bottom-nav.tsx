"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, Users, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

const navItems: NavItem[] = [
  { label: "首页", href: "/", icon: LayoutDashboard },
  { label: "房源", href: "/properties", icon: Building2, disabled: true },
  { label: "客户", href: "/clients", icon: Users, disabled: true },
  { label: "我的", href: "/settings/profile", icon: User },
];

function DisabledBadge() {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute -top-0.5 right-1",
        "rounded-full px-1.5 py-0.5",
        "bg-muted text-muted-foreground",
        "text-[8px] leading-none font-medium"
      )}
    >
      即将开放
    </span>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed bottom-0 inset-x-0 z-40",
        "border-t bg-background",
        "pb-[env(safe-area-inset-bottom,0px)]",
        "md:hidden"
      )}
      aria-label="主导航"
    >
      <div className="flex h-14 items-center justify-around px-2">
        {navItems.map((item) => {
          const Icon = item.icon;

          if (item.disabled) {
            return (
              <span
                key={item.href}
                aria-disabled="true"
                className={cn(
                  "relative",
                  "flex flex-col items-center justify-center gap-0.5",
                  "min-h-[44px] min-w-[44px]",
                  "rounded-md",
                  "text-muted-foreground/40 cursor-default select-none"
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span className="text-[10px] leading-none">{item.label}</span>
                <DisabledBadge />
              </span>
            );
          }

          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5",
                "min-h-[44px] min-w-[44px]",
                "rounded-md transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span className="text-[10px] leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
