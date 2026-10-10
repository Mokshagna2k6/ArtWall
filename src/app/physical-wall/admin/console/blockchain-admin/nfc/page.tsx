import type { Metadata } from "next";
import { desc, sql } from "drizzle-orm";

import { Page, Stat, Table } from "@/features/blockchain-admin/ui";
import { requireAnyAdminRolePage } from "@/features/physical-wall/authorize";
import { db } from "@/lib/db/index";
import { artTags } from "@/lib/db/schema";

export const metadata: Metadata = { title: "NFC tags", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NfcTagsPage() {
  await requireAnyAdminRolePage(["blockchain_admin"], "/physical-wall/admin/console/blockchain-admin/nfc");

  const byStatus = await db
    .select({ tagType: artTags.tagType, bindingStatus: artTags.bindingStatus, n: sql<number>`count(*)::int` })
    .from(artTags)
    .groupBy(artTags.tagType, artTags.bindingStatus);
  const total = (s: string) => byStatus.filter((r) => r.bindingStatus === s).reduce((a, r) => a + r.n, 0);

  const recent = await db
    .select({
      id: artTags.id,
      tagType: artTags.tagType,
      bindingStatus: artTags.bindingStatus,
      bindingLevel: artTags.bindingLevel,
      scanCount: artTags.scanCount,
      sun: artTags.sunCounterLastSeen,
      boundAt: artTags.boundAt,
    })
    .from(artTags)
    .orderBy(desc(artTags.createdAt))
    .limit(50);

  return (
    <Page
      title="NFC & QR tags"
      scope="Read-only, from art_tags. Shows binding lifecycle and scan counters. Key material is never stored here (only a KMS reference) and is not shown."
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Unprovisioned" value={total("unprovisioned")} />
        <Stat label="Provisioned" value={total("provisioned")} />
        <Stat label="Bound" value={total("bound")} />
        <Stat label="Revoked" value={total("revoked")} />
      </div>
      <Table
        title="50 most recent tags"
        head={["Tag", "Type", "Binding", "Level", "Scans", "SUN counter", "Bound"]}
        empty="No tags yet."
        rows={recent.map((t) => [
          <span key="i" className="font-mono text-xs">{t.id}</span>,
          t.tagType,
          t.bindingStatus,
          t.bindingLevel ?? "—",
          t.scanCount,
          t.sun ?? "—",
          t.boundAt ? new Date(t.boundAt).toLocaleDateString("en-IN") : "—",
        ])}
      />
    </Page>
  );
}
