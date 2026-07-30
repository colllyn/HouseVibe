import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "阳光智家 / HouseVibe",
  description: "AI-powered real estate content and CRM platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
