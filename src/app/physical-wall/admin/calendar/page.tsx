import type { Metadata } from "next";
import Link from "next/link";

import { getCalendar } from "@/features/physical-wall/data/calendar";
import { countQueue } from "@/features/physical-wall/data/waitlist";

export const metadata: Metadata = {
  title: "Calendar",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 28;

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayIndex(from: string, iso: string): number {
  return Math.round(
    (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000
  );
}

/**
 * The exhibition calendar (F16).
 *
 * A Gantt over CSS grid rather than a charting library: one row per slot, one
 * column per day, and a bar placed with `gridColumn`. That keeps it printable,
 * keyboard-scrollable, and free of a dependency whose only job would be drawing
 * rectangles.
 *
 * Gaps lead, because they are the actionable half. A three-day hole in a wall
 * that has a queue behind it is money left on the table, and the spec asks for
 * exactly this pairing.
 */
export default async function AdminCalendarPage({
  searchParams,
}: PageProps<"/physical-wall/admin/calendar">) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const requested = typeof params.from === "string" ? params.from : undefined;
  const from =
    requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;

  const [calendar, queueLength] = await Promise.all([
    getCalendar(from, WINDOW_DAYS),
    countQueue(),
  ]);

  const days = Array.from({ length: WINDOW_DAYS }, (_, index) =>
    addDays(from, index)
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-display">Calendar</h1>
          <p className="text-ink-muted mt-3 max-w-2xl text-sm leading-6">
            {WINDOW_DAYS} days from {from}. Every paid booking on the wall, and
            every gap of three days or more.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/physical-wall/admin/calendar?from=${addDays(from, -WINDOW_DAYS)}`}
            className="border-hairline-strong hover:border-ink text-small inline-flex h-10 items-center rounded-md border px-4"
          >
            Earlier
          </Link>
          <Link
            href={`/physical-wall/admin/calendar?from=${addDays(from, WINDOW_DAYS)}`}
            className="border-hairline-strong hover:border-ink text-small inline-flex h-10 items-center rounded-md border px-4"
          >
            Later
          </Link>
        </div>
      </div>

      {calendar.gaps.length > 0 && (
        <section>
          <h2 className="font-heading text-section">Gaps worth filling</h2>
          <p className="text-ink-muted mt-2 text-sm leading-6">
            {queueLength > 0
              ? `${queueLength} artist${queueLength === 1 ? " is" : "s are"} in the queue. Offering one of these openings takes a click.`
              : "Nobody is in the queue to fill these yet."}
          </p>

          <ul className="mt-4 flex flex-col gap-2">
            {calendar.gaps.slice(0, 8).map((gap) => (
              <li
                key={`${gap.slotId}-${gap.startDate}`}
                className="border-hairline flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <span>
                  <strong>{gap.slotLabel}</strong> empty for{" "}
                  <strong className="tabular-nums">{gap.days}</strong> days —{" "}
                  <span className="text-ink-muted">
                    {gap.startDate} to {gap.endDate}
                  </span>
                </span>
                {queueLength > 0 && (
                  <Link
                    href="/physical-wall/admin/queue"
                    className="border-hairline-strong hover:border-ink text-small inline-flex h-9 shrink-0 items-center rounded-md border px-3"
                  >
                    Offer it
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-heading text-section">Master schedule</h2>

        {calendar.slots.length === 0 ? (
          <p className="border-hairline text-ink-muted mt-4 rounded-md border border-dashed p-8 text-center text-sm">
            No wall layout is published.
          </p>
        ) : (
          <div className="border-hairline mt-4 overflow-x-auto rounded-md border">
            <div className="min-w-[52rem]">
              {/* Day header */}
              <div
                className="border-hairline bg-band grid border-b"
                style={{
                  gridTemplateColumns: `5rem repeat(${WINDOW_DAYS}, minmax(0,1fr))`,
                }}
              >
                <div className="text-label text-ink-muted px-3 py-2 tracking-wider uppercase">
                  Slot
                </div>
                {days.map((day) => (
                  <div
                    key={day}
                    className={`px-1 py-2 text-center text-[0.625rem] tabular-nums ${
                      day === today ? "text-ink font-medium" : "text-ink-muted"
                    }`}
                  >
                    {day.slice(8)}
                  </div>
                ))}
              </div>

              {calendar.slots.map((slot) => {
                const bars = calendar.bars.filter(
                  (bar) => bar.slotId === slot.id
                );
                return (
                  <div
                    key={slot.id}
                    className="border-hairline grid items-center border-b last:border-b-0"
                    style={{
                      gridTemplateColumns: `5rem repeat(${WINDOW_DAYS}, minmax(0,1fr))`,
                      minHeight: "2.5rem",
                    }}
                  >
                    <div className="text-ink px-3 text-xs font-medium">
                      {slot.label}
                    </div>

                    {bars.map((bar) => {
                      // Clamp to the window: a booking that started before it
                      // still needs to render from the left edge.
                      const start = Math.max(
                        0,
                        dayIndex(calendar.from, bar.startDate)
                      );
                      const end = Math.min(
                        WINDOW_DAYS - 1,
                        dayIndex(calendar.from, bar.endDate)
                      );
                      if (end < start) return null;

                      return (
                        <div
                          key={bar.bookingId}
                          title={`${bar.artworkTitle ?? "Untitled"} — ${bar.artistName} (${bar.startDate} to ${bar.endDate})`}
                          className="bg-ink text-wall-paper mx-0.5 flex h-6 items-center overflow-hidden rounded-sm px-2 text-[0.625rem] whitespace-nowrap"
                          style={{
                            gridColumn: `${start + 2} / span ${end - start + 1}`,
                            gridRow: 1,
                          }}
                        >
                          {bar.artistName}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
