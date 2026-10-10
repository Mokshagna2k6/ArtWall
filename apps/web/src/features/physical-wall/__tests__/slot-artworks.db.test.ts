import { afterAll, describe, expect, it, vi } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeArtwork, makeBooking, makeSlots, makeUser, purgeTestData, q } from "@/test/fixtures";

const grid = vi.hoisted(() => ({ id: "" }));
vi.mock("@/features/physical-wall/data/wall", async (orig) => ({
  ...(await orig<object>()),
  getActiveGrid: vi.fn(async () => ({ id: grid.id, name: "test", rowCount: 1, colCount: 20, isTemplate: false, active: true, version: 1 })),
  getOccupancyPct: vi.fn(async () => 0),
}));

import { attachArtwork, reserveBooking } from "@/features/physical-wall/actions/booking";
import { getBookingDetail } from "@/features/physical-wall/data/bookings";
import { getPublicArtwork } from "@/features/physical-wall/data/wall";

afterAll(purgeTestData);

const idle = { status: "idle" } as never;

function form(slotIds: string[], art: Record<string, string> = {}, start = "2031-03-01") {
  const f = new FormData();
  for (const s of slotIds) f.append("slotIds", s);
  f.set("durationDays", "7");
  f.set("startDate", start);
  for (const [slot, a] of Object.entries(art)) f.set(`artwork_${slot}`, a);
  return f;
}

async function setup(n: number) {
  const slots = await makeSlots(n);
  grid.id = (await q<{ grid_id: string }>(`select grid_id from pw_slots where id = $1`, [slots[0]]))[0].grid_id;
  const artist = await makeUser();
  actAs(artist);
  return { slots, artist };
}

const slotRows = (bk: string) =>
  q<{ slot_id: string; artwork_id: string | null }>(
    `select slot_id, artwork_id from pw_booking_slots where booking_id = $1 order by slot_id`,
    [bk]
  );

describe("per-slot artwork assignment (0064)", () => {
  it("reserve assigns a distinct artwork to each slot and mirrors the primary onto the booking", async () => {
    const { slots, artist } = await setup(3);
    const [a1, a2] = [await makeArtwork(artist.id), await makeArtwork(artist.id)];

    const res = await reserveBooking(idle, form(slots, { [slots[0]]: a1, [slots[2]]: a2 }));
    expect(res.status).toBe("ok");
    const bk = (res as { data: { bookingId: string } }).data.bookingId;

    const rows = await slotRows(bk);
    expect(rows.find((r) => r.slot_id === slots[0])?.artwork_id).toBe(a1);
    expect(rows.find((r) => r.slot_id === slots[1])?.artwork_id).toBeNull();
    expect(rows.find((r) => r.slot_id === slots[2])?.artwork_id).toBe(a2);
    const [booking] = await q<{ artwork_id: string }>(`select artwork_id from pw_bookings where id = $1`, [bk]);
    expect([a1, a2]).toContain(booking.artwork_id);

    const detail = await getBookingDetail(bk);
    expect(detail?.slots.filter((s) => s.artworkId).length).toBe(2);
  });

  it("refuses someone else's artwork and the same artwork twice; nothing is held", async () => {
    const { slots, artist } = await setup(2);
    const mine = await makeArtwork(artist.id);
    const theirs = await makeArtwork((await makeUser()).id);

    expect((await reserveBooking(idle, form([slots[0]], { [slots[0]]: theirs }))).status).toBe("error");
    expect((await reserveBooking(idle, form(slots, { [slots[0]]: mine, [slots[1]]: mine }))).status).toBe("error");
    const held = await q(`select 1 from pw_booking_slots where slot_id = any($1)`, [slots]);
    expect(held).toHaveLength(0);
  });

  it("an artwork cannot be on the wall twice over overlapping dates", async () => {
    const { slots, artist } = await setup(2);
    const art = await makeArtwork(artist.id);
    expect((await reserveBooking(idle, form([slots[0]], { [slots[0]]: art }))).status).toBe("ok");
    const second = await reserveBooking(idle, form([slots[1]], { [slots[1]]: art }));
    expect(second.status).toBe("error");
    expect((second as { message: string }).message).toMatch(/already booked/);
    // Different dates are fine.
    expect((await reserveBooking(idle, form([slots[1]], { [slots[1]]: art }, "2031-06-01"))).status).toBe("ok");
  });

  it("attachArtwork targets a slot, rejects foreign slots, and moves a work between slots", async () => {
    const { slots, artist } = await setup(2);
    const art = await makeArtwork(artist.id);
    const bk = await makeBooking(artist.id, slots, { status: "held" });

    const att = (slotId?: string) => {
      const f = new FormData();
      f.set("bookingId", bk);
      f.set("artworkId", art);
      if (slotId) f.set("slotId", slotId);
      return attachArtwork(idle, f);
    };

    expect((await att("not-a-slot-of-this-booking")).status).toBe("error");
    expect((await att(slots[1])).status).toBe("ok");
    expect((await slotRows(bk)).find((r) => r.slot_id === slots[1])?.artwork_id).toBe(art);
    expect((await att(slots[0])).status).toBe("ok");
    const rows = await slotRows(bk);
    expect(rows.filter((r) => r.artwork_id === art)).toHaveLength(1);
    expect(rows.find((r) => r.slot_id === slots[0])?.artwork_id).toBe(art);
  });
});

describe("0064 backfill", () => {
  it("moves a legacy booking-level artwork onto its first slot, idempotently", async () => {
    const { slots, artist } = await setup(2);
    const art = await makeArtwork(artist.id);
    const bk = await makeBooking(artist.id, slots, { status: "paid" });
    await q(`update pw_bookings set artwork_id = $2 where id = $1`, [bk, art]);

    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("../../db/migrations/0064_pw_booking_slot_artwork.sql", "utf8");
    await q(sql);
    await q(sql);

    const rows = await slotRows(bk);
    expect(rows.filter((r) => r.artwork_id)).toEqual([{ slot_id: [...slots].sort()[0], artwork_id: art }]);
  });

  it("a live legacy booking still resolves its public artwork page", async () => {
    const { slots, artist } = await setup(1);
    const art = await makeArtwork(artist.id);
    await q(`update artworks set "isPublic" = true where id = $1`, [art]);
    const bk = await makeBooking(artist.id, slots, { status: "paid" });
    await q(`update pw_booking_slots set artwork_id = $2 where booking_id = $1`, [bk, art]);
    await q(`update pw_slots set state = 'live' where id = $1`, [slots[0]]);
    expect((await getPublicArtwork(art))?.slotLabel).toBe("T0");
  });
});
