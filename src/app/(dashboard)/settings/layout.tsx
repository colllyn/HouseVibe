import { SettingsLayout } from "@/components/ui/settings-layout";

export default function SettingsGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsLayout>{children}</SettingsLayout>;
}
