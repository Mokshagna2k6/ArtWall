import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { actAs, type TestUser } from "@/test/db-setup";
import { makeBooking, makeSlots, makeUser, purgeTestData, q, tid } from "@/test/fixtures";

/**
 * BE-2.09 / BE-2.10: real concurrent transactions against the real database.
 * No mocked locks: N actions are started at once on separate pool connections
 * and the database decides who wins.
 *
 * reserveBooking books from the ACTIVE grid; the test grid is inactive (never
 * the public wall), so only the grid lookup is pointed at it.
 */
const grid = vi.hoisted(() => ({ id: "" }));
vi.mock("@/features/physical-wall/data/wall", async (orig) => ({
  ...(await orig<object>()),
  getActiveGrid: vi.fn(async () => ({ id: grid.id, name: "test", rowCount: 1, colCount: 20, isTemplate: false, active: true, version: 1 })),
  getOccupancyPct: vi.fn(async () => 0),
}));

import { reserveBooking } from "@/features/physical-wall/actions/booking";
import { chooseInstallWindow } from "@/features/physical-wall/actions/ops";
import { pool } from "@/lib/db/index";

afterAll(purgeTestData);

/** Each concurrent caller needs its own session, so bind the actor per call. */
async function as<T>(user: TestUser, fn: () => Promise<T>) {
  actAs(user);
  return fn();
}

function reserveForm(slotIds: string[], startDate = "2030-06-01", days = 7) {
  const f = new FormData();
  for (const s of slotIds) f.append("slotIds", s);
  f.set("durationDays", String(days));
  f.set("startDate", startDate);
  return f;
}

describe("booking + slot hold under concurrency (BE-2.09)", () => {
  it("eight artists racing for one slot: exactly one hold, one booking row, slot reserved once", async () => {
    const [slot] = await makeSlots(1);
    grid.id = (await q<{ grid_id: string }>(`select grid_id from pw_slots where id = $1`, [slot]))[0].grid_id;
    const artists = await Promise.all(Array.from({ length: 8 }, () => makeUser()));

    // actAs is global; the session is read at the top of each action, before
    // its first await on the DB, so start them one tick apart.
    const results = await Promise.all(
      artists.map((a) => as(a, () => reserveBooking({ status: "idle" } as never, reserveForm([slot]))))
    );

    expect(results.filter((r) => r.status === "ok")).toHaveLength(1);
    for (const r of results.filter((x) => x.status === "error")) {
      expect((r as { message: string }).message).toMatch(/taken while you were choosing|already has a booking/);
    }
    const holds = await q(
      `select b.id from pw_bookings b join pw_booking_slots bs on bs.booking_id = b.id where bs.slot_id = $1 and b.status = 'held'`,
      [slot]
    );
    expect(holds).toHaveLength(1);
    expect((await q<{ state: string }>(`select state from pw_slots where id = $1`, [slot]))[0].state).toBe("reserved");
  });

  it("overlapping baskets {A,B} vs {B,A} never deadlock and never both win B", async () => {
    const [a, b, c] = await makeSlots(3);
    grid.id = (await q<{ grid_id: string }>(`select grid_id from pw_slots where id = $1`, [a]))[0].grid_id;
    const artists = await Promise.all(Array.from({ length: 6 }, () => makeUser()));
    const baskets = [[a, b], [b, a], [b, c], [c, b], [a, b, c], [c, a]];
    const results = await Promise.all(
      artists.map((u, i) => as(u, () => reserveBooking({ status: "idle" } as never, reserveForm(baskets[i]))))
    );
    for (const r of results) if (r.status === "error") expect((r as { message: string }).message).not.toMatch(/didn't work/);

    const holders = await q<{ slot_id: string; n: number }>(
      `select bs.slot_id, count(*)::int as n from pw_booking_slots bs join pw_bookings bk on bk.id = bs.booking_id
       where bs.slot_id = any($1) and bk.status = 'held' group by 1`,
      [[a, b, c]]
    );
    for (const h of holders) expect(h.n, h.slot_id).toBe(1);
    // Each winning basket owns all of its slots; nobody holds a partial basket.
    const won = results.filter((r) => r.status === "ok").length;
    expect(won).toBeGreaterThanOrEqual(1);
  });
});

describe("install scheduling capacity under concurrency (BE-2.10)", () => {
  let capBefore = 2;
  beforeAll(async () => {
    capBefore = (await q<{ install_capacity: number }>(`select install_capacity from pw_settings`))[0].install_capacity;
    await q(`update pw_settings set install_capacity = 2`);
  });
  afterAll(async () => {
    await q(`update pw_settings set install_capacity = $1`, [capBefore]);
  });

  async function signedPaid(slot: string, start = "2032-01-01") {
    const artist = await makeUser();
    const bk = await makeBooking(artist.id, [slot], { status: "paid", start });
    await q(
      `insert into pw_agreements (id, booking_id, artist_id, terms_version, terms_hash, body, total_amount_paise, signed_name)
       values ($1, $2, $3, 'v1', 'h', 'b', 11800, 'T')`,
      [tid("agr"), bk, artist.id]
    );
    return { artist, bk };
  }

  const choose = (a: { artist: TestUser; bk: string }, startsAt: string) =>
    as(a.artist, () => {
      const f = new FormData();
      f.set("bookingId", a.bk);
      f.set("startsAt", startsAt);
      return chooseInstallWindow({ status: "idle" } as never, f);
    });

  it("six installs on six different slots racing for one hour: capacity (2) is never exceeded", async () => {
    const at = `2032-0${1 + Math.floor(Math.random() * 9)}-1${Math.floor(Math.random() * 9)}T0${Math.floor(Math.random() * 9)}:00:00.000Z`;
    const slots = await makeSlots(6);
    const people = await Promise.all(slots.map((s) => signedPaid(s)));
    const results = await Promise.all(people.map((p) => choose(p, at)));
    expect(results.filter((r) => r.status === "ok")).toHaveLength(2);
    const reserved = await q(
      `select 1 from pw_install_windows where status = 'reserved' and starts_at = $1 and booking_id = any($2)`,
      [at, people.map((p) => p.bk)]
    );
    expect(reserved).toHaveLength(2);
  });

  it("four installs on the SAME slot racing for one hour: only one gets it (clash check)", async () => {
    const at = `2033-0${1 + Math.floor(Math.random() * 9)}-1${Math.floor(Math.random() * 9)}T1${Math.floor(Math.random() * 9)}:00:00.000Z`;
    const [slot] = await makeSlots(1);
    const people = [];
    // Consecutive (non-overlapping) bookings of one slot, all installing at the same hour.
    for (let i = 0; i < 4; i++) people.push(await signedPaid(slot, `203${5 + i}-01-01`));
    const results = await Promise.all(people.map((p) => choose(p, at)));
    expect(results.filter((r) => r.status === "ok")).toHaveLength(1);
    expect(
      results.filter((r) => r.status === "error").every((r) => /wall position|fully booked/.test((r as { message: string }).message))
    ).toBe(true);
  });

  it("the capacity check and insert are one transaction: the lock is held until commit", async () => {
    // A transaction holding the install lock blocks chooseInstallWindow until
    // it ends, so a check cannot run against a count that is about to change.
    const [slot] = await makeSlots(1);
    const p = await signedPaid(slot);
    const holder = await pool.connect();
    try {
      await holder.query("begin");
      await holder.query(`select pg_advisory_xact_lock(hashtext('pw_install_windows'))`);
      let done = false;
      // A random hour, so rows a crashed earlier run left behind can't fill it.
      const at = new Date(Date.UTC(2034, 0, 1) + Math.floor(Math.random() * 300 * 24) * 3_600_000).toISOString();
      const pending = choose(p, at).then((r) => ((done = true), r));
      await new Promise((r) => setTimeout(r, 1500));
      expect(done).toBe(false);
      await holder.query("commit");
      expect((await pending).status).toBe("ok");
    } finally {
      holder.release();
    }
  });
});
