import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "任务 - HouseVibe",
};

export default function TasksLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
