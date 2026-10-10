import type { Metadata } from "next";
import { desc } from "drizzle-orm";

import { ipfsPinState, mintHealth } from "@/features/blockchain-admin/logic";
import { Page, Stat, Table } from "@/features/blockchain-admin/ui";
import { requireAnyAdminRolePage } from "@/features/physical-wall/authorize";
import { db } from "@/lib/db/index";
import { coaCertificates } from "@/lib/db/schema";

export const metadata: Metadata = { title: "IPFS pins & mints", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function IpfsPinsPage() {
  await requireAnyAdminRolePage(["blockchain_admin"], "/physical-wall/admin/console/blockchain-admin/ipfs");

  const certs = await db
    .select({
      id: coaCertificates.id,
      status: coaCertificates.status,
      imageCid: coaCertificates.imageCid,
      metadataCid: coaCertificates.metadataCid,
      txHash: coaCertificates.txHash,
      mintRequestedAt: coaCertificates.mintRequestedAt,
      mintError: coaCertificates.mintError,
      createdAt: coaCertificates.createdAt,
    })
    .from(coaCertificates)
    .orderBy(desc(coaCertificates.createdAt))
    .limit(500);

  const now = new Date();
  const rows = certs.map((c) => ({ ...c, pin: ipfsPinState(c), health: mintHealth(c, now) }));
  const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  // Only certificates that have entered the NFT flow are expected to carry CIDs.
  const attention = rows.filter((r) => r.health === "failed" || r.health === "stuck" || r.pin === "partial");

  return (
    <Page
      title="IPFS pins & mint state"
      scope="Read-only, from coa_certificates (the 500 most recent). CIDs are recorded when the upload route pins; this page does not re-query Pinata, so it shows recorded state, not live gateway reachability."
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Pinned (image + metadata)" value={count((r) => r.pin === "pinned")} />
        <Stat label="Partially pinned" value={count((r) => r.pin === "partial")} />
        <Stat label="Minted" value={count((r) => r.status === "minted")} />
        <Stat label="Failed / stuck mints" value={count((r) => r.health === "failed" || r.health === "stuck")} />
      </div>
      <Table
        title="Needs attention"
        head={["Certificate", "Status", "Pin", "Mint", "Metadata CID", "Error"]}
        empty="No failed, stuck or partially pinned certificates."
        rows={attention.map((r) => [
          <span key="i" className="font-mono text-xs">{r.id}</span>,
          r.status,
          r.pin,
          r.health,
          <span key="c" className="font-mono text-xs">{r.metadataCid ?? "—"}</span>,
          r.mintError ?? "—",
        ])}
      />
    </Page>
  );
}
