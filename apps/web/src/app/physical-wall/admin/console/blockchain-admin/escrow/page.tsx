import type { Metadata } from "next";
import { desc } from "drizzle-orm";

import { escrowTotals, isOverdueHold } from "@/features/blockchain-admin/logic";
import { Page, Stat, Table } from "@/features/blockchain-admin/ui";
import { requireAnyAdminRolePage } from "@/features/physical-wall/authorize";
import { formatINR } from "@/features/physical-wall/money";
import { db } from "@/lib/db/index";
import { escrowHolds } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Escrow", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EscrowPage() {
  await requireAnyAdminRolePage(["blockchain_admin"], "/physical-wall/admin/console/blockchain-admin/escrow");

  const holds = await db.select().from(escrowHolds).orderBy(desc(escrowHolds.createdAt)).limit(500);
  const now = new Date();
  const t = escrowTotals(holds);
  const overdue = holds.filter((h) => isOverdueHold(h, now));

  return (
    <Page
      title="Escrow"
      scope="Wall-booking payments only (escrow_holds, linked to pw_bookings). There are no buyer artwork-checkout orders in the system yet, so no artwork-sale escrow appears here. Totals cover the 500 most recent holds."
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={`Held now (${t.heldCount})`} value={formatINR(t.held)} />
        <Stat label="Overdue for release" value={overdue.length} />
        <Stat label="Released" value={formatINR(t.released)} />
        <Stat label="Refunded" value={formatINR(t.refunded)} />
      </div>
      <Table
        title="Holds past their dispute window, still held"
        head={["Hold", "Booking", "Amount", "Eligible since"]}
        empty="None overdue."
        rows={overdue.map((h) => [
          <span key="i" className="font-mono text-xs">{h.id}</span>,
          <span key="b" className="font-mono text-xs">{h.bookingId}</span>,
          formatINR(h.amountPaise),
          h.releaseEligibleAt ? new Date(h.releaseEligibleAt).toLocaleDateString("en-IN") : "—",
        ])}
      />
    </Page>
  );
}
