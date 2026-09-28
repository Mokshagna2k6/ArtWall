import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeBooking, makeSlots, makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import { chooseInstallWindow } from "@/features/physical-wall/actions/ops";

let capBefore = 2;
beforeAll(async () => {
  capBefore = (await q<{ install_capacity: number }>(`select install_capacity from pw_settings`))[0].install_capacity;
  await q(`update pw_settings set install_capacity = 2`);
});
afterAll(async () => {
  await q(`update pw_settings set install_capacity = $1`, [capBefore]);
  await purgeTestData();
});

// A far-future hour nobody else books, so real data can't interfere.
const at = `2031-03-0${Math.floor(Math.random() * 9) + 1}T0${Math.floor(Math.random() * 9)}:00:00.000Z`;

async function signedPaidBooking(slots: string[], start = "2031-03-01") {
  const artist = await makeUser();
  const bk = await makeBooking(artist.id, slots, { status: "paid", start });
  await q(
    `insert into pw_agreements (id, booking_id, artist_id, terms_version, terms_hash, body, total_amount_paise, signed_name)
     values ($1, $2, $3, 'v1', 'h', 'b', 11800, 'T')`,
    [tid("agr"), bk, artist.id]
  );
  return { artist, bk };
}

async function choose(artist: { id: string; name: string; email: string }, bk: string, startsAt = at) {
  actAs(artist);
  const f = new FormData();
  f.set("bookingId", bk);
  f.set("startsAt", startsAt);
  return chooseInstallWindow({ status: "idle" } as never, f);
}

describe("install scheduling (BE-1.15 / 1.16)", () => {
  it("rejects a clash on the same wall slot, allows other slots up to capacity, then rejects", async () => {
    const [shared, other1, other2] = await makeSlots(3);
    const a = await signedPaidBooking([shared]);
    const b = await signedPaidBooking([shared], "2031-04-01"); // same slot, later run
    const c = await signedPaidBooking([other1]);
    const d = await signedPaidBooking([other2]);

    expect((await choose(a.artist, a.bk)).status).toBe("ok");

    const clash = await choose(b.artist, b.bk);
    expect(clash.status).toBe("error");
    expect((clash as { message: string }).message).toMatch(/wall position/);

    expect((await choose(c.artist, c.bk)).status).toBe("ok"); // 2 of 2
    const full = await choose(d.artist, d.bk);
    expect(full.status).toBe("error");
    expect((full as { message: string }).message).toMatch(/fully booked/);

    // Re-choosing replaces your own window rather than counting against you.
    expect((await choose(a.artist, a.bk)).status).toBe("ok");
    expect(await q(`select 1 from pw_install_windows where booking_id = $1 and status = 'reserved'`, [a.bk])).toHaveLength(1);

    // An hour later is free.
    const later = new Date(new Date(at).getTime() + 3600_000).toISOString();
    expect((await choose(d.artist, d.bk, later)).status).toBe("ok");
  });

  it("rejects a time in the past", async () => {
    const [slot] = await makeSlots(1);
    const a = await signedPaidBooking([slot]);
    expect((await choose(a.artist, a.bk, "2020-01-01T10:00:00.000Z")).status).toBe("error");
  });
});
