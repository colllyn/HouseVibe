import { exportDataAction, deleteAccountAction } from "./actions";
import { PrivacySection } from "@/components/ui/privacy-section";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <PrivacySection
      privacyPolicyUrl="/privacy-policy"
      onExportData={exportDataAction}
      onDeleteAccount={deleteAccountAction}
    />
  );
}
