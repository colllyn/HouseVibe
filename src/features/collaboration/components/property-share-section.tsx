"use client";

import { useRouter } from "next/navigation";
import { ShareForm } from "./share-form";

interface PropertyShareSectionProps {
  propertyId: string;
  isShared: boolean;
  allowMarketingReuse: boolean;
  sharedExpiresAt: string | null;
  commissionSplit: string | null;
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start justify-between py-2 border-b border-muted last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{String(value)}</span>
    </div>
  );
}

export function PropertyShareSection({
  propertyId,
  isShared,
  allowMarketingReuse,
  sharedExpiresAt,
  commissionSplit,
}: PropertyShareSectionProps) {
  const router = useRouter();

  return (
    <section className="rounded-lg border mb-6">
      <h2 className="font-semibold text-sm px-4 py-3 border-b">共享与营销</h2>
      <div className="px-4 py-2">
        <DetailRow label="共享库" value={isShared ? "已上架" : "未上架"} />
        <DetailRow label="营销复用授权" value={allowMarketingReuse ? "已授权" : "未授权"} />
        <DetailRow label="共享有效期" value={sharedExpiresAt} />
        <DetailRow label="佣金说明" value={commissionSplit} />
      </div>
      <div className="px-4 py-2 border-t">
        <ShareForm
          propertyId={propertyId}
          isShared={isShared}
          allowMarketingReuse={allowMarketingReuse}
          sharedExpiresAt={sharedExpiresAt}
          commissionSplit={commissionSplit}
          onUpdated={() => {
            router.refresh();
          }}
        />
      </div>
    </section>
  );
}
