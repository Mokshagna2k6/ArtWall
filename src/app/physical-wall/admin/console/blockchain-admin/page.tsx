import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";

import { requireAnyAdminRolePage } from "@/features/physical-wall/authorize";
import { db } from "@/lib/db/index";
import { merkleRoots } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "Blockchain Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const BASE = "/physical-wall/admin/console/blockchain-admin";
const LINKS = [
  { href: `${BASE}/ipfs`, label: "IPFS pins & mint state", note: "Recorded CIDs and mint health per certificate." },
  { href: `${BASE}/nfc`, label: "NFC & QR tags", note: "Binding lifecycle and scan counters." },
  { href: `${BASE}/escrow`, label: "Escrow", note: "Wall-booking holds only; no artwork-sale escrow exists yet." },
  { href: `${BASE}/fraud`, label: "Fraud signals", note: "Leads from payments, refunds, tag scans and wallet links." },
] as const;

/**
 * FE-3.18: `blockchain_admin` is brand new (migration 0059), no existing
 * equivalent. Unlike a from-scratch subsystem, Merkle root posting IS real
 * code here already (features/coa/merkle-commit.ts, the merkle-root cron) —
 * this page reads the existing `merkle_roots` table read-only, which is "show
 * it for real" at its smallest: a query, not a dashboard. Fraud/escrow/
 * NFC-pin status etc. have no backing code at all, so those stay honest
 * placeholders rather than being built in this round (explicitly out of
 * scope).
 */
export default async function BlockchainAdminConsolePage() {
  await requireAnyAdminRolePage(["blockchain_admin"], "/physical-wall/admin/console/blockchain-admin");

  const roots = await db
    .select({
      id: merkleRoots.id,
      status: merkleRoots.status,
      leafCount: merkleRoots.leafCount,
      txHash: merkleRoots.txHash,
      createdAt: merkleRoots.createdAt,
    })
    .from(merkleRoots)
    .orderBy(desc(merkleRoots.createdAt))
    .limit(20);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">Blockchain Admin</h1>
        <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
          On-chain provenance. No write action is gated behind this role yet
          — this page is a read-only status view of the existing Merkle
          root posting pipeline.
        </p>
      </div>

      <div>
        <p className="text-label text-ink-muted tracking-wider uppercase">Merkle root posting (real, read-only)</p>
        {roots.length === 0 ? (
          <div className="border-hairline mt-3 rounded-md border border-dashed p-10 text-center">
            <p className="text-ink-muted text-sm">No Merkle roots yet.</p>
          </div>
        ) : (
          <div className="border-hairline mt-3 overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-hairline text-ink-muted border-b text-left text-xs uppercase tracking-wider">
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Leaves</th>
                  <th className="px-4 py-3">Tx hash</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {roots.map((r, i) => (
                  <tr key={r.id} className={i > 0 ? "border-hairline border-t" : undefined}>
                    <td className="px-4 py-3">{r.status}</td>
                    <td className="px-4 py-3 tabular-nums">{r.leafCount}</td>
                    <td className="max-w-[16rem] truncate px-4 py-3 font-mono text-xs">{r.txHash ?? "—"}</td>
                    <td className="px-4 py-3">{new Date(r.createdAt).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <p className="text-label text-ink-muted tracking-wider uppercase">Read-only views</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {LINKS.map((l) => (
            <li key={l.href} className="border-hairline rounded-md border p-4">
              <Link href={l.href} className="font-heading text-card underline">{l.label}</Link>
              <p className="text-ink-muted mt-1 text-sm leading-6">{l.note}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
