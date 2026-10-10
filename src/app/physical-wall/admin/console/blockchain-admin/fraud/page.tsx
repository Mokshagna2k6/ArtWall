import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";

import { duplicateWallets } from "@/features/blockchain-admin/logic";
import { Page, Stat, Table } from "@/features/blockchain-admin/ui";
import { requireAnyAdminRolePage } from "@/features/physical-wall/authorize";
import { formatINR } from "@/features/physical-wall/money";
import { db } from "@/lib/db/index";
import { artistProfiles, artTagScans, pwPayments, pwRefunds } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Fraud signals", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const SCAN_BURST = 20; // scans of one tag in 24h before it is worth a look
const day = (n: number) => new Date(Date.now() - n * 86_400_000);

export default async function FraudSignalsPage() {
  await requireAnyAdminRolePage(["blockchain_admin"], "/physical-wall/admin/console/blockchain-admin/fraud");

  const [failedPayments, dupCaptures, failedRefunds, bursts, wallets] = await Promise.all([
    db
      .select()
      .from(pwPayments)
      .where(and(eq(pwPayments.status, "failed"), gte(pwPayments.createdAt, day(30))))
      .orderBy(desc(pwPayments.createdAt))
      .limit(50),
    db
      .select({ bookingId: pwPayments.bookingId, n: sql<number>`count(*)::int` })
      .from(pwPayments)
      .where(eq(pwPayments.status, "captured"))
      .groupBy(pwPayments.bookingId)
      .having(sql`count(*) > 1`)
      .limit(50),
    db.select().from(pwRefunds).where(eq(pwRefunds.status, "failed")).orderBy(desc(pwRefunds.updatedAt)).limit(50),
    db
      .select({ tagId: artTagScans.tagId, n: sql<number>`count(*)::int` })
      .from(artTagScans)
      .where(gte(artTagScans.scannedAt, day(1)))
      .groupBy(artTagScans.tagId)
      .having(sql`count(*) >= ${SCAN_BURST}`)
      .orderBy(sql`count(*) desc`)
      .limit(50),
    db
      .select({ userId: artistProfiles.userId, walletAddress: artistProfiles.walletAddress })
      .from(artistProfiles)
      .where(isNotNull(artistProfiles.walletAddress)),
  ]);
  const sharedWallets = duplicateWallets(wallets);

  return (
    <Page
      title="Fraud signals"
      scope="Signals derived from data that exists today: wall-booking payments and refunds, tag scans, and artist wallet links. There is no buyer-checkout data yet, so no artwork-sale fraud is covered. Each row is a lead to investigate, not a verdict; nothing is auto-actioned."
    >
      <div className="grid gap-3 sm:grid-cols-5">
        <Stat label="Failed payments (30d)" value={failedPayments.length} />
        <Stat label="Double-captured bookings" value={dupCaptures.length} />
        <Stat label="Failed refunds" value={failedRefunds.length} />
        <Stat label={`Tags ≥${SCAN_BURST} scans/24h`} value={bursts.length} />
        <Stat label="Shared wallets" value={sharedWallets.length} />
      </div>
      <Table
        title="Bookings with more than one captured payment"
        head={["Booking", "Captures"]}
        empty="None."
        rows={dupCaptures.map((d) => [<span key="b" className="font-mono text-xs">{d.bookingId}</span>, d.n])}
      />
      <Table
        title="Failed payments, last 30 days"
        head={["Payment", "Booking", "Amount", "Provider", "When"]}
        empty="None."
        rows={failedPayments.map((p) => [
          <span key="i" className="font-mono text-xs">{p.id}</span>,
          <span key="b" className="font-mono text-xs">{p.bookingId}</span>,
          formatINR(p.amountPaise),
          p.provider,
          new Date(p.createdAt).toLocaleString("en-IN"),
        ])}
      />
      <Table
        title="Failed refunds"
        head={["Refund", "Booking", "Amount", "Attempts", "Last error"]}
        empty="None."
        rows={failedRefunds.map((r) => [
          <span key="i" className="font-mono text-xs">{r.id}</span>,
          <span key="b" className="font-mono text-xs">{r.bookingId}</span>,
          formatINR(r.amountPaise),
          r.attempts,
          r.lastError ?? "—",
        ])}
      />
      <Table
        title="Tags scanned unusually often in the last 24 hours"
        head={["Tag", "Scans"]}
        empty="None."
        rows={bursts.map((b) => [<span key="t" className="font-mono text-xs">{b.tagId}</span>, b.n])}
      />
      <Table
        title="Wallet linked to more than one artist profile"
        head={["Wallet", "Artist user IDs"]}
        empty="None."
        rows={sharedWallets.map((w) => [
          <span key="w" className="font-mono text-xs">{w.walletAddress}</span>,
          w.userIds.join(", "),
        ])}
      />
      <p className="text-ink-muted text-sm">
        For who-did-what, see the{" "}
        <Link href="/physical-wall/admin/audit" className="underline">
          audit log
        </Link>
        .
      </p>
    </Page>
  );
}
