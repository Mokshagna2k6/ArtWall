import type { Metadata } from "next";
import Link from "next/link";

import { requireRolePage } from "@/features/physical-wall/authorize";
import { FeedbackForm } from "@/features/physical-wall/components/feedback-form";
import { getBookingDetail } from "@/features/physical-wall/data/bookings";
import { getSql } from "@/lib/db";

export const metadata: Metadata = {
  title: "How was it?",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Has this booking already been answered? One response per booking (F32). */
async function alreadyAnswered(bookingId: string): Promise<boolean> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select 1 from pw_feedback where booking_id = ${bookingId} limit 1
    `) as unknown[];
    return rows.length > 0;
  } catch (error) {
    console.error("[physical-wall] Could not read feedback", error);
    return false;
  }
}

/**
 * The post-exhibition survey (F32).
 *
 * Its own page rather than a panel on the bookings list, because the spec's
 * lifecycle is "exhibition ends → survey invite → artist submits" — an invite
 * needs somewhere to point, and a link in an email cannot open an accordion.
 *
 * Scoped to the artist who owns the booking. A guessed id shows nothing.
 */
export default async function FeedbackPage({
  params,
}: PageProps<"/physical-wall/feedback/[bookingId]">) {
  const { bookingId } = await params;
  const actor = await requireRolePage(
    "artist",
    `/physical-wall/feedback/${bookingId}`
  );

  const booking = await getBookingDetail(bookingId);

  // Ownership check, not just existence: this page is reached from a link, and
  // the link is guessable in a way a session is not.
  if (!booking || booking.artistId !== actor.id) {
    return (
      <Shell>
        <h1 className="font-heading text-display">We can&rsquo;t find that.</h1>
        <p className="text-ink-muted mt-4 text-sm leading-6">
          That booking either doesn&rsquo;t exist or isn&rsquo;t yours.
        </p>
        <BackLink />
      </Shell>
    );
  }

  if (await alreadyAnswered(bookingId)) {
    return (
      <Shell>
        <p className="text-signal text-eyebrow">Already sent</p>
        <h1 className="font-heading text-display mt-3">
          You&rsquo;ve told us about this one.
        </h1>
        <p className="text-ink-muted mt-4 text-sm leading-6">
          One response per exhibition, so nobody gets nagged into filling the
          same form twice.
        </p>
        <BackLink />
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-signal text-eyebrow">Ric Platter</p>
      <h1 className="font-heading text-display mt-3 text-balance">
        How was your exhibition?
      </h1>
      <p className="text-ink-muted mt-4 text-sm leading-6">
        Two questions and a box. It goes to the founders and shapes how the next
        one runs — it isn&rsquo;t published, and it isn&rsquo;t scored against
        you.
      </p>

      <div className="mt-10">
        <FeedbackForm
          bookingId={booking.id}
          slotLabels={booking.slots.map((slot) => slot.label)}
          endDate={booking.endDate}
        />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-5 pt-24 pb-24 sm:px-8 sm:pt-32">
      {children}
    </main>
  );
}

function BackLink() {
  return (
    <Link
      href="/physical-wall/bookings"
      className="border-hairline-strong hover:border-ink text-small mt-8 inline-flex h-10 items-center rounded-md border px-4"
    >
      Back to your bookings
    </Link>
  );
}
