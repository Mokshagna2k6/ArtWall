import type { Metadata } from "next";
import Link from "next/link";

import { siteConfig } from "@/config/site";
import { requireOnboardedPage } from "@/features/physical-wall/authorize";
import { BookingCard } from "@/features/physical-wall/components/booking-card";
import { listBookingsForArtist } from "@/features/physical-wall/data/bookings";
import { isRazorpayConfigured } from "@/features/physical-wall/razorpay";
import { getSql } from "@/lib/db";

export const metadata: Metadata = {
  title: "My bookings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Slot labels per booking, so the card can name the positions being held. */
async function loadSlotLabels(bookingIds: string[]) {
  const map = new Map<string, string[]>();
  if (bookingIds.length === 0) return map;

  try {
    const sql = getSql();
    const rows = (await sql.query(
      `select bs.booking_id, s.label
       from pw_booking_slots bs
       join pw_slots s on s.id = bs.slot_id
       where bs.booking_id = any($1::text[])
       order by s.row_index asc, s.col_index asc`,
      [bookingIds]
    )) as { booking_id: string; label: string }[];

    for (const row of rows) {
      const list = map.get(String(row.booking_id)) ?? [];
      list.push(String(row.label));
      map.set(String(row.booking_id), list);
    }
  } catch (error) {
    console.error("[physical-wall] Could not read slot labels", error);
  }
  return map;
}

/** Signed agreements by booking, so the card knows what is unlocked (F20). */
async function loadAgreements(artistId: string) {
  const map = new Map<string, { signedAt: string; termsHash: string }>();
  try {
    const sql = getSql();
    const rows = (await sql`
      select booking_id, signed_at, terms_hash
      from pw_agreements where artist_id = ${artistId}
    `) as Record<string, unknown>[];

    for (const row of rows) {
      map.set(String(row.booking_id), {
        signedAt: String(row.signed_at),
        termsHash: String(row.terms_hash),
      });
    }
  } catch (error) {
    console.error("[physical-wall] Could not read agreements", error);
  }
  return map;
}

export default async function MyBookingsPage() {
  const actor = await requireOnboardedPage("artist", "/physical-wall/bookings");
  const bookings = await listBookingsForArtist(actor.id);
  const [labels, agreements] = await Promise.all([
    loadSlotLabels(bookings.map((booking) => booking.id)),
    loadAgreements(actor.id),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-5 pt-24 pb-24 sm:px-8 sm:pt-32">
      <p className="text-signal text-eyebrow">Ric Platter</p>
      <h1 className="font-heading text-display mt-4">Your bookings</h1>
      <p className="text-ink-muted mt-4 text-sm leading-6">
        Pay for a hold, choose an install window, and pick up the code you show
        at the counter.
      </p>

      {bookings.length === 0 ? (
        <div className="border-hairline mt-10 rounded-md border border-dashed p-8 text-center">
          <p className="font-heading text-card">Nothing booked yet</p>
          <p className="text-ink-muted mx-auto mt-2 max-w-sm text-sm leading-6">
            When you take a slot on the wall it appears here, along with
            everything you need to get the work hung.
          </p>
          <Link
            href="/physical-wall/book"
            className="bg-ember text-wall-paper hover:bg-ember-glow text-small mt-6 inline-flex h-10 items-center rounded-md px-4"
          >
            Book a slot
          </Link>
        </div>
      ) : (
        <ul className="mt-10 flex flex-col gap-5">
          {bookings.map((booking) => (
            <li key={booking.id}>
              <BookingCard
                booking={booking}
                slotLabels={labels.get(booking.id) ?? []}
                qrBase={siteConfig.url}
                paymentsEnabled={isRazorpayConfigured()}
                agreement={agreements.get(booking.id) ?? null}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
