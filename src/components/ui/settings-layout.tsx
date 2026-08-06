"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Building, Shield, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsNavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const settingsNavItems: SettingsNavItem[] = [
  { label: "个人资料", href: "/settings/profile", icon: User },
  { label: "工作区", href: "/settings/workspace", icon: Building },
  { label: "AI 偏好", href: "/settings/ai-preferences", icon: Brain },
  { label: "隐私", href: "/settings/privacy", icon: Shield },
];

export function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh md:min-h-0">
      {/* Page title — mobile only */}
      <div className="md:hidden px-4 pt-4 pb-2">
        <h1 className="text-lg font-semibold">设置</h1>
      </div>

      {/* Mobile sub-nav: horizontal tabs */}
      <nav
        className="md:hidden overflow-x-auto border-b"
        aria-label="设置子导航"
      >
        <div className="flex px-2">
          {settingsNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-3",
                  "text-sm font-medium whitespace-nowrap",
                  "min-h-[44px]",
                  "border-b-2 transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop layout: sidebar + content */}
      <div className="md:flex md:gap-8 md:px-6 md:py-6">
        {/* Desktop sub-nav: vertical sidebar */}
        <nav
          className="hidden md:block md:w-48 md:flex-shrink-0"
          aria-label="设置子导航"
        >
          <h2 className="mb-4 px-3 text-lg font-semibold">设置</h2>
          <ul className="space-y-1">
            {settingsNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");

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

        {/* Content area */}
        <div className="flex-1 min-w-0 px-4 pb-24 pt-4 md:px-0 md:pb-8 md:pt-0">
          {children}
        </div>
      </div>
    </div>
  );
}
