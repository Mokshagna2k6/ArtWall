import type { Metadata } from "next";

import { requireRolePage } from "@/features/physical-wall/authorize";
import { listPendingVerifications } from "@/features/physical-wall/actions/identity";
import { IdentityReviewList } from "@/features/physical-wall/components/identity-review";

export const metadata: Metadata = {
  title: "Identity Verification",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function IdentityPage() {
  await requireRolePage("admin", "/physical-wall/admin/identity");
  const pending = await listPendingVerifications();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">Identity verification</h1>
        <p className="text-ink-muted mt-2 text-sm">
          Artists must verify their identity before receiving payouts. Review
          uploaded documents below.
        </p>
      </div>
      <IdentityReviewList items={pending} />
    </div>
  );
}
