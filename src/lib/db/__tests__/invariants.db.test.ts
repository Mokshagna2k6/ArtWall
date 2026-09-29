import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { pool } from "@/lib/db/index";
import { makeArtwork, makeBooking, makeSlots, makeUser, purgeTestData, q, tid } from "@/test/fixtures";

/**
 * Database invariants (docs/db/invariants.md). Every test ATTEMPTS the
 * violation with raw SQL, bypassing all application code, and asserts the
 * database itself refuses it, by SQLSTATE:
 *
 *   42501 permission denied (REVOKE)      23001 restrict_violation (guard trigger)
 *   23514 check_violation                  23505 unique_violation
 *   23P01 exclusion_violation              23503 foreign_key_violation
 *
 * Where a table has both a REVOKE and a trigger, the trigger is tested on its
 * own too: `granted` re-grants the privilege inside a transaction that is
 * always rolled back, so the trigger is the only thing left standing.
 */

afterAll(purgeTestData);

async function rejects(p: Promise<unknown>, code: string) {
  const error = await p.then(
    () => null,
    (e: { code?: string; message?: string }) => e
  );
  expect(error, `expected SQLSTATE ${code}, but the statement succeeded`).not.toBeNull();
  expect(error!.code, error!.message).toBe(code);
  return error!;
}

/** Run fn in a transaction that is always rolled back. */
async function rolledBack<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
}

/** Like rolledBack, with `privs` on `table` re-granted, so only the trigger guards it. */
const granted = <T>(table: string, privs: string, fn: (c: PoolClient) => Promise<T>) =>
  rolledBack(async (c) => {
    await c.query(`grant ${privs} on ${table} to current_user`);
    return fn(c);
  });

const erasing = (c: PoolClient, userId: string) =>
  c.query(`select set_config('artwall.erasing_user', $1, true)`, [userId]);

describe("DB-2.01 pw_ledger is append-only", () => {
  it("refuses UPDATE, DELETE and TRUNCATE by privilege and by trigger", async () => {
    const id = tid("led");
    await q(
      `insert into pw_ledger (id, type, category, amount_paise, source_ref) values ($1, 'revenue', 'other', 500, $1)`,
      [id]
    );
    await rejects(q(`update pw_ledger set amount_paise = 1 where id = $1`, [id]), "42501");
    await rejects(q(`delete from pw_ledger where id = $1`, [id]), "42501");
    await rejects(q(`truncate pw_ledger`), "42501");

    await granted("pw_ledger", "update, delete, truncate", async (c) => {
      await rejects(c.query(`update pw_ledger set amount_paise = 1 where id = $1`, [id]), "23001");
    });
    await granted("pw_ledger", "update, delete, truncate", async (c) => {
      await rejects(c.query(`delete from pw_ledger where id = $1`, [id]), "23001");
    });
    await granted("pw_ledger", "update, delete, truncate", async (c) => {
      await rejects(c.query(`truncate pw_ledger`), "23001");
    });
    expect(await q(`select amount_paise from pw_ledger where id = $1`, [id])).toEqual([{ amount_paise: 500 }]);
  });
});

describe("DB-2.02 provenance_events is append-only", () => {
  it("refuses UPDATE and DELETE; DELETE only inside an erasure of the artwork's owner", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const art = await makeArtwork(owner.id);
    const id = tid("prov");
    await q(`insert into provenance_events (id, artwork_id, event_type, actor_id, label) values ($1, $2, 'created', $3, 'x')`, [
      id,
      art,
      owner.id,
    ]);

    await rejects(q(`update provenance_events set label = 'forged' where id = $1`, [id]), "42501");
    await granted("provenance_events", "update", (c) =>
      rejects(c.query(`update provenance_events set label = 'forged' where id = $1`, [id]), "23001")
    );
    await rejects(q(`delete from provenance_events where id = $1`, [id]), "23001");
    await rejects(q(`truncate provenance_events`), "42501");
    // Erasing someone else does not unlock this artist's provenance.
    await rolledBack(async (c) => {
      await erasing(c, other.id);
      await rejects(c.query(`delete from provenance_events where id = $1`, [id]), "23001");
    });
    // Erasing the owner does.
    await rolledBack(async (c) => {
      await erasing(c, owner.id);
      expect((await c.query(`delete from provenance_events where id = $1`, [id])).rowCount).toBe(1);
    });
    // ...and only inside that transaction.
    await rejects(q(`delete from provenance_events where id = $1`, [id]), "23001");
  });
});

describe("DB-2.03 / DB-2.04 ownership and price history", () => {
  it("records every owner and price by trigger, and never lets history be rewritten", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const art = await makeArtwork(a.id, { pricePaise: 100_00 });
    await q(`update artworks set price_paise = 25000 where id = $1`, [art]);
    await q(`update artworks set price_paise = null where id = $1`, [art]);
    await q(`update artworks set "userId" = $2 where id = $1`, [art, b.id]);
    await q(`update artworks set title = 'renamed' where id = $1`, [art]); // no history row

    expect(
      await q(`select owner_id from artwork_ownership_history where artwork_id = $1 order by id`, [art])
    ).toEqual([{ owner_id: a.id }, { owner_id: b.id }]);
    expect(
      await q(`select price_paise from artwork_price_history where artwork_id = $1 order by id`, [art])
    ).toEqual([{ price_paise: 10000 }, { price_paise: 25000 }, { price_paise: null }]);

    for (const [table, set] of [
      ["artwork_ownership_history", `owner_id = '${b.id}'`],
      ["artwork_price_history", "price_paise = 1"],
    ]) {
      await rejects(q(`update ${table} set ${set} where artwork_id = $1`, [art]), "42501");
      await granted(table, "update", (c) =>
        rejects(c.query(`update ${table} set ${set} where artwork_id = $1`, [art]), "23001")
      );
      await rejects(q(`delete from ${table} where artwork_id = $1`, [art]), "23001");
      await rejects(q(`truncate ${table}`), "42501");
    }

    // History goes only with its artwork (the FK cascade), never on its own.
    await q(`delete from artworks where id = $1`, [art]);
    expect(await q(`select 1 from artwork_ownership_history where artwork_id = $1`, [art])).toHaveLength(0);
    expect(await q(`select 1 from artwork_price_history where artwork_id = $1`, [art])).toHaveLength(0);
  });
});

describe("DB-2.05 pw_audit_log is append-only", () => {
  it("refuses UPDATE/DELETE; actor_label may change only while erasing that actor", async () => {
    const actor = await makeUser("admin");
    const [{ id }] = await q<{ id: string }>(
      `insert into pw_audit_log (actor_id, actor_label, action, subject_type, subject_id)
       values ($1, 'Real Name', 'betest.action', 'betest', $2) returning id`,
      [actor.id, tid("subj")]
    );
    await rejects(q(`update pw_audit_log set action = 'nothing happened' where id = $1`, [id]), "42501");
    await rejects(q(`delete from pw_audit_log where id = $1`, [id]), "42501");
    await rejects(q(`truncate pw_audit_log`), "42501");
    await rejects(q(`update pw_audit_log set actor_label = 'someone else' where id = $1`, [id]), "23001");
    await granted("pw_audit_log", "update, delete", async (c) => {
      await rejects(c.query(`update pw_audit_log set action = 'x' where id = $1`, [id]), "23001");
    });
    await granted("pw_audit_log", "update, delete", async (c) => {
      await rejects(c.query(`delete from pw_audit_log where id = $1`, [id]), "23001");
    });
    await rolledBack(async (c) => {
      await erasing(c, actor.id);
      expect((await c.query(`update pw_audit_log set actor_label = 'Erased user' where id = $1`, [id])).rowCount).toBe(1);
      // Pseudonymising is all erasure may do.
      await rejects(c.query(`update pw_audit_log set actor_label = 'x', action = 'y' where id = $1`, [id]), "42501");
    });
  });
});

describe("condition reports are append-only", () => {
  it("refuses edits to photos and damage records; resolved_at may be set once", async () => {
    const artist = await makeUser();
    const [slot] = await makeSlots(1);
    const bk = await makeBooking(artist.id, [slot], { status: "paid" });
    const photo = tid("cp");
    await q(
      `insert into pw_condition_photos (id, booking_id, slot_id, item_key, cloudinary_id, url) values ($1, $2, $3, 'front', 'x', 'https://x')`,
      [photo, bk, slot]
    );
    const dmg = tid("dmg");
    await q(
      `insert into pw_damage_records (id, booking_id, slot_id, item_key, description, photo_id) values ($1, $2, $3, 'front', 'scratch', $4)`,
      [dmg, bk, slot, photo]
    );
    await rejects(q(`update pw_condition_photos set url = 'https://other' where id = $1`, [photo]), "42501");
    await rejects(q(`delete from pw_condition_photos where id = $1`, [photo]), "42501");
    await granted("pw_condition_photos", "update, delete", (c) =>
      rejects(c.query(`update pw_condition_photos set url = 'https://other' where id = $1`, [photo]), "23001")
    );
    await rejects(q(`update pw_damage_records set description = 'fine' where id = $1`, [dmg]), "42501");
    await rejects(q(`delete from pw_damage_records where id = $1`, [dmg]), "42501");

    await q(`update pw_damage_records set resolved_at = now() where id = $1`, [dmg]);
    await rejects(q(`update pw_damage_records set resolved_at = now() - interval '1 day' where id = $1`, [dmg]), "23001");
    // Evidence outlives nothing silently: its booking cannot be deleted from under it.
    await rejects(q(`delete from pw_bookings where id = $1`, [bk]), "23503");
  });
});

async function makeCert(userId: string, artId: string, status: string, extra: Record<string, unknown> = {}) {
  const id = tid("coa");
  const cols = { id, artwork_id: artId, user_id: userId, metadata_hash: tid("hash"), status, ...extra };
  const names = Object.keys(cols).map((k) => (/[A-Z]/.test(k) ? `"${k}"` : k));
  await q(
    `insert into coa_certificates (${names.join(", ")}) values (${names.map((_, i) => `$${i + 1}`).join(", ")})`,
    Object.values(cols)
  );
  return id;
}

describe("DB-2.06 issued certificate content is immutable", () => {
  it("refuses changes to hash, artwork and issue date once issued, and deleting it", async () => {
    const u = await makeUser();
    const art = await makeArtwork(u.id);
    const art2 = await makeArtwork(u.id);
    const cert = await makeCert(u.id, art, "issued", { issued_at: new Date("2026-01-01") });

    await rejects(q(`update coa_certificates set metadata_hash = 'tampered' where id = $1`, [cert]), "23001");
    await rejects(q(`update coa_certificates set artwork_id = $2 where id = $1`, [cert, art2]), "23001");
    await rejects(q(`update coa_certificates set issued_at = now() where id = $1`, [cert]), "23001");
    await rejects(q(`delete from coa_certificates where id = $1`, [cert]), "23001");
    await rejects(q(`update coa_certificates set status = 'draft' where id = $1`, [cert]), "23514");

    // Revoking is allowed, and freezes the row for good.
    await q(`update coa_certificates set status = 'revoked', revoked_at = now(), revoke_reason = 'x' where id = $1`, [cert]);
    await rejects(q(`update coa_certificates set status = 'metadata_pinned' where id = $1`, [cert]), "23001");
    await rejects(q(`update coa_certificates set revoke_reason = 'y' where id = $1`, [cert]), "23001");

    // A draft is still editable and deletable.
    const draft = await makeCert(u.id, art, "draft");
    await q(`update coa_certificates set metadata_hash = $2 where id = $1`, [draft, tid("hash")]);
    await q(`delete from coa_certificates where id = $1`, [draft]);
  });
});

describe("DB-2.14 mint state transitions", () => {
  it("minted requires tx, token, chain and contract, and cannot skip 'minting'", async () => {
    const u = await makeUser();
    const art = await makeArtwork(u.id);
    const pinned = await makeCert(u.id, art, "metadata_pinned", { metadataUri: "ipfs://x" });

    await rejects(q(`update coa_certificates set status = 'minting' where id = $1`, [pinned]), "23514"); // no txHash
    await rejects(
      q(
        `update coa_certificates set status = 'minted', "txHash" = '0x1', "tokenId" = '1', "chainId" = 84532,
           "contractAddr" = '0xc', "mintedAt" = now() where id = $1`,
        [pinned]
      ),
      "23514" // metadata_pinned -> minted skips 'minting' (trigger)
    );
    await q(`update coa_certificates set status = 'minting', "txHash" = '0xabc', "chainId" = 84532 where id = $1`, [pinned]);
    await rejects(q(`update coa_certificates set status = 'minted' where id = $1`, [pinned]), "23514"); // no token
    await q(
      `update coa_certificates set status = 'minted', "tokenId" = $2, "contractAddr" = '0xC0FFEE', "mintedAt" = now() where id = $1`,
      [pinned, tid("tok")]
    );
    // Minted facts are final, even after a revoke.
    await rejects(q(`update coa_certificates set "tokenId" = '999' where id = $1`, [pinned]), "23001");
    await rejects(q(`update coa_certificates set status = 'failed' where id = $1`, [pinned]), "23514");

    await rejects(
      q(`insert into mint_commitments (id, artwork_id, user_id, leaf_hash, status) values ($1, $2, $3, $4, 'minted')`, [
        tid("mint"),
        art,
        u.id,
        tid("leaf"),
      ]),
      "23514"
    );
  });
});

describe("DB-2.15 a mint voucher nonce is issued once", () => {
  it("refuses a second certificate with the same nonce", async () => {
    const u = await makeUser();
    const art = await makeArtwork(u.id);
    const nonce = `0x${tid("n")}`;
    await makeCert(u.id, art, "metadata_pinned", { mintNonce: nonce });
    await rejects(makeCert(u.id, art, "metadata_pinned", { mintNonce: nonce }), "23505");
  });
});

describe("DB-2.16 tag uid and binding", () => {
  it("refuses a duplicate uid (any case) and a binding stamp without an artwork", async () => {
    const u = await makeUser();
    const art = await makeArtwork(u.id);
    const uid = `BETEST-${tid("uid")}`.toUpperCase();
    await q(`insert into art_tags (id, tag_uid, artwork_id, bound_by, bound_at) values ($1, $2, $3, $4, now())`, [
      tid("tag"),
      uid,
      art,
      u.id,
    ]);
    await rejects(q(`insert into art_tags (id, tag_uid) values ($1, $2)`, [tid("tag"), uid]), "23505");
    await rejects(q(`insert into art_tags (id, tag_uid) values ($1, $2)`, [tid("tag"), uid.toLowerCase()]), "23505");
    await rejects(q(`insert into art_tags (id, tag_uid, bound_at) values ($1, $2, now())`, [tid("tag"), tid("uid")]), "23514");
    await rejects(q(`update art_tags set artwork_id = null where tag_uid = $1`, [uid]), "23514");
    // A bound artwork cannot be deleted out from under its tag.
    await rejects(q(`delete from artworks where id = $1`, [art]), "23503");
    await q(`update art_tags set artwork_id = null, bound_at = null where tag_uid = $1`, [uid]);
  });
});

describe("DB-2.09 no overlapping live bookings on a slot", () => {
  it("refuses an overlap from any write path; cancelled bookings and adjacent dates are fine", async () => {
    const a = await makeUser();
    const [slot] = await makeSlots(1);
    const first = await makeBooking(a.id, [slot], { status: "paid", start: "2030-05-10", days: 7 });
    await rejects(makeBooking(a.id, [slot], { status: "held", start: "2030-05-16", days: 3 }), "23P01");
    await makeBooking(a.id, [slot], { status: "paid", start: "2030-05-17", days: 3 }); // adjacent: ok

    // Cancel frees the dates; an expired hold coming back to life re-checks them.
    const late = await makeBooking(a.id, [slot], { status: "expired", start: "2030-05-12", days: 2 });
    await q(`update pw_bookings set status = 'cancelled' where id = $1`, [first]);
    const taker = await makeBooking(a.id, [slot], { status: "paid", start: "2030-05-13", days: 1 });
    await rejects(q(`update pw_bookings set status = 'paid' where id = $1`, [late]), "23P01");
    await q(`update pw_bookings set status = 'refunded' where id = $1`, [taker]);
    await q(`update pw_bookings set status = 'paid' where id = $1`, [late]);
    // Moving dates onto someone else is refused too.
    await rejects(q(`update pw_bookings set start_date = '2030-05-18', end_date = '2030-05-18' where id = $1`, [late]), "23P01");
  });

  it("two concurrent transactions booking the same slot and dates: exactly one commits", async () => {
    const a = await makeUser();
    const [slot] = await makeSlots(1);
    const clients = await Promise.all([pool.connect(), pool.connect()]);
    try {
      const ids = [tid("bk"), tid("bk")];
      await Promise.all(clients.map((c) => c.query("begin")));
      const attempt = (c: PoolClient, id: string) =>
        (async () => {
          await c.query(
            `insert into pw_bookings (id, artist_id, status, start_date, end_date, duration_days) values ($1, $2, 'paid', '2030-08-01', '2030-08-07', 7)`,
            [id, a.id]
          );
          await c.query(`insert into pw_booking_slots (booking_id, slot_id, quoted_price_paise) values ($1, $2, 0)`, [id, slot]);
          await c.query("commit");
        })().catch(async (e) => {
          await c.query("rollback");
          throw e;
        });
      const results = await Promise.allSettled(clients.map((c, i) => attempt(c, ids[i])));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const failure = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(failure.reason.code).toBe("23P01");
    } finally {
      clients.forEach((c) => c.release());
    }
  });
});

describe("DB-2.10 install capacity holds under concurrency", () => {
  it("capacity + 2 concurrent reservations of one hour: exactly `capacity` commit", async () => {
    const [{ install_capacity: cap }] = await q<{ install_capacity: number }>(`select install_capacity from pw_settings`);
    const n = cap + 2;
    const artist = await makeUser();
    const bookings: string[] = [];
    for (let i = 0; i < n; i++) {
      bookings.push(await makeBooking(artist.id, await makeSlots(1), { status: "paid", start: "2032-01-01" }));
    }
    // An hour nobody else uses.
    const hour = new Date(Date.UTC(2032, 0, 1 + Math.floor(Math.random() * 28), Math.floor(Math.random() * 24)));
    const end = new Date(hour.getTime() + 3600_000);

    const clients = await Promise.all(bookings.map(() => pool.connect()));
    try {
      await Promise.all(clients.map((c) => c.query("begin")));
      const results = await Promise.allSettled(
        clients.map(async (c, i) => {
          try {
            await c.query(
              `insert into pw_install_windows (id, booking_id, starts_at, ends_at, status) values ($1, $2, $3, $4, 'reserved')`,
              [tid("iw"), bookings[i], hour.toISOString(), end.toISOString()]
            );
            await c.query("commit");
          } catch (e) {
            await c.query("rollback");
            throw e;
          }
        })
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(cap);
      for (const r of results.filter((r) => r.status === "rejected") as PromiseRejectedResult[]) {
        expect(r.reason.code).toBe("23514");
      }
      expect(
        await q(`select 1 from pw_install_windows where status = 'reserved' and starts_at = $1`, [hour.toISOString()])
      ).toHaveLength(cap);
    } finally {
      clients.forEach((c) => c.release());
    }
  });
});

describe("DB-2.08 money is integer paise, never negative", () => {
  it("has no numeric/float money column and every *_paise column has a >= 0 check", async () => {
    expect(
      await q(
        `select table_name, column_name from information_schema.columns
         where table_schema = 'public' and data_type in ('numeric', 'real', 'double precision', 'money')`
      )
    ).toEqual([]);
    const unchecked = await q(
      `select c.table_name, c.column_name from information_schema.columns c
       where c.table_schema = 'public' and c.column_name ilike '%paise%'
         and c.data_type not in ('integer', 'bigint')
       union all
       select c.table_name, c.column_name from information_schema.columns c
       where c.table_schema = 'public' and c.column_name ilike '%paise%'
         and not exists (
           select 1 from pg_constraint k
           where k.conrelid = format('%I.%I', c.table_schema, c.table_name)::regclass and k.contype = 'c'
             and pg_get_constraintdef(k.oid) ~ ('\\m' || c.column_name || '\\M"? (>|>=) 0'))`
    );
    expect(unchecked).toEqual([]);
    await rejects(
      q(`insert into pw_ledger (id, type, category, amount_paise) values ($1, 'expense', 'misc', -1)`, [tid("led")]),
      "23514"
    );
  });
});

describe("DB-2.11 foreign keys state their ON DELETE", () => {
  it("has no implicit NO ACTION key, and financial records restrict their booking", async () => {
    expect(
      await q(`select conrelid::regclass::text, conname from pg_constraint
               where contype = 'f' and connamespace = 'public'::regnamespace and confdeltype = 'a'`)
    ).toEqual([]);
    const rows = await q<{ conname: string; confdeltype: string }>(
      `select conname, confdeltype from pg_constraint where conname = any($1)`,
      [[
        "pw_invoices_booking_id_fkey", "pw_payments_booking_id_fkey", "pw_agreements_booking_id_fkey",
        "pw_ledger_booking_id_fkey", "pw_refunds_booking_id_fkey", "provenance_events_artwork_id_fkey",
        "coa_certificates_artwork_id_fkey", "pw_audit_log_actor_id_fkey",
      ]]
    );
    expect(rows).toHaveLength(8);
    for (const r of rows) expect(r.confdeltype, r.conname).toBe("r");

    const artist = await makeUser();
    const bk = await makeBooking(artist.id, await makeSlots(1), { status: "paid" });
    await q(
      `insert into pw_invoices (id, booking_id, number, issue_date, place_of_supply, hsn_sac, gstin_supplier, net_paise, cgst_paise, sgst_paise, total_paise, line_items)
       values ($1, $2, $1, current_date, '08-Rajasthan', '997212', 'X', 10000, 900, 900, 11800, '[]')`,
      [tid("inv"), bk]
    );
    await rejects(q(`delete from pw_bookings where id = $1`, [bk]), "23503");
  });
});

describe("DB-2.12 marketplace query uses its indexes", () => {
  it("plans discoverArtworks' filters on the partial marketplace indexes", async () => {
    // The shape discoverArtworks (features/marketplace/actions.ts) generates.
    const plan = await rolledBack(async (c) => {
      await c.query("set local enable_seqscan = off"); // the dev table is tiny; ask what the planner CAN use
      const { rows } = await c.query(
        `explain select a.id from artworks a join artist_profiles p on a."userId" = p."userId"
         where a."isPublic" = true and a.status = 'available' and p.published = true
           and a.category = $1 and a.price_paise >= $2 and a.price_paise <= $3
         order by a.price_paise asc nulls last limit 48`,
        ["painting", 0, 100_000_00]
      );
      return rows.map((r) => r["QUERY PLAN"]).join("\n");
    });
    expect(plan).toMatch(/artworks_market_(category_price|price)_idx/);
  });
});
