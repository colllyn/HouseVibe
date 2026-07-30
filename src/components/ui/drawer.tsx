"use client";

import * as React from "react";
import { Drawer as VaulDrawer } from "vaul";
import { cn } from "@/lib/utils";

type DrawerProps = React.ComponentPropsWithoutRef<typeof VaulDrawer.Root>;

function Drawer({ children, ...props }: DrawerProps) {
  return <VaulDrawer.Root {...props}>{children}</VaulDrawer.Root>;
}

function DrawerTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof VaulDrawer.Trigger>) {
  return (
    <VaulDrawer.Trigger
      className={cn("cursor-pointer", className)}
      {...props}
    />
  );
}

function DrawerPortal({
  children,
}: {
  children: React.ReactNode;
}) {
  return <VaulDrawer.Portal>{children}</VaulDrawer.Portal>;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof VaulDrawer.Overlay>) {
  return (
    <VaulDrawer.Overlay
      className={cn("fixed inset-0 z-50 bg-black/50", className)}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof VaulDrawer.Content>) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <VaulDrawer.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50",
          "flex flex-col",
          "rounded-t-[10px] border bg-background",
          "max-h-[92dvh]",
          "pt-[env(safe-area-inset-top,0px)]",
          "pb-[env(safe-area-inset-bottom,0px)]",
          className
        )}
        {...props}
      >
        <div className="mx-auto mt-4 h-1.5 w-10 rounded-full bg-muted flex-shrink-0" />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </VaulDrawer.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DrawerFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-auto flex flex-col gap-2 p-4",
        "pb-[env(safe-area-inset-bottom,0px)]",
        className
      )}
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof VaulDrawer.Title>) {
  return (
    <VaulDrawer.Title
      className={cn(
        "text-lg font-semibold leading-none tracking-tight",
        className
      )}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof VaulDrawer.Description>) {
  return (
    <VaulDrawer.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function DrawerClose({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof VaulDrawer.Close>) {
  return (
    <VaulDrawer.Close
      className={cn("cursor-pointer", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
