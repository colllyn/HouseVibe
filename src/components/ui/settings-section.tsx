import * as React from "react";
import { cn } from "@/lib/utils";

export interface SettingsSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingsSection({
  title,
  description,
  children,
  className,
}: SettingsSectionProps) {
  return (
    <section className={cn("space-y-4", className)}>
      {(title || description) ? (
        <div className="space-y-1">
          {title ? (
            <h3 className="text-base font-semibold text-foreground">
              {title}
            </h3>
          ) : null}
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
