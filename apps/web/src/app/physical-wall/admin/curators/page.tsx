import type { Metadata } from "next";

import { requireAnyAdminRolePage } from "@/features/physical-wall/authorize";
import { getCuratorsForReview } from "@/features/curators/actions";
import { CuratorReviewList } from "@/features/curators/curator-review";

export const metadata: Metadata = {
  title: "Curator review",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CuratorReviewPage() {
  await requireAnyAdminRolePage(["curator_admin"], "/physical-wall/admin/curators");
  const items = await getCuratorsForReview();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">Curators</h1>
        <p className="text-ink-muted mt-2 text-sm">
          Approve curator applications or suspend an active curator. Every
          decision is written to the audit log under your name.
        </p>
      </div>
      <CuratorReviewList
        items={items.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
