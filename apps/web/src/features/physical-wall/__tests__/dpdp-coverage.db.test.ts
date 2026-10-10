import { afterAll, describe, expect, it } from "vitest";

import { actAs, type TestUser } from "@/test/db-setup";
import { makeArtwork, makeBooking, makeProfile, makeSlots, makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import { eraseMyData, exportMyData } from "@/features/physical-wall/actions/account";
import { RETAINED_USER_REFERENCES } from "@/features/physical-wall/data-rights";

/**
 * BE-2.20 / 2.21 / 2.22. One user with a row in every data category, then:
 * export (every category present), erase (the user id survives only where
 * RETAINED_USER_REFERENCES says it may, found by scanning every column of
 * every table), and the request log recorded both, append-only.
 * No Cloudinary: asset ids are fake and only need to be queued.
 */

afterAll(purgeTestData);

async function seedEverything(): Promise<TestUser> {
  const user = await makeUser();
  const u = user.id;
  await makeProfile(u);
  const art = await makeArtwork(u, { imagePublicId: `artwall/betest/${tid("cov")}` });

  await q(`insert into session (id, "userId", token, "expiresAt", "createdAt", "updatedAt") values ($1, $2, $1, now() + interval '1 day', now(), now())`, [tid("sess"), u]);
  await q(`insert into account (id, "userId", "accountId", "providerId", "createdAt", "updatedAt") values ($1, $2, $3, 'google', now(), now())`, [tid("acc"), u, tid("gid")]);
  await q(`insert into pw_consents (id, user_id, purpose, granted, notice_version) values ($1, $2, 'account', true, 'v1')`, [tid("con"), u]);
  await q(`insert into pw_identity_verifications (id, user_id, doc_cloudinary_id, doc_kind) values ($1, $2, $3, 'pan')`, [tid("idv"), u, `artwall/betest/${tid("idv")}`]);
  const ugcConsent = tid("con");
  await q(`insert into pw_consents (id, user_id, purpose, granted, notice_version) values ($1, $2, 'ugc_publication', true, 'v1')`, [ugcConsent, u]);
  await q(
    `insert into pw_ugc_submissions (id, user_id, cloudinary_id, url, caption, status, kind, consent_id)
     values ($1, $2, $3, 'https://x', 'betest cov', 'pending', 'selfie', $4)`,
    [tid("ugc"), u, `artwall/ugc/${tid("cov")}`, ugcConsent]
  );
  await q(`insert into pw_grievances (id, user_id, contact, subject, body, due_at) values ($1, $2, $3, 'betest', 'body text', now())`, [tid("gr"), u, user.email]);
  await q(`insert into coa_certificates (id, artwork_id, user_id, metadata_hash, status, issued_at) values ($1, $2, $3, $4, 'issued', now())`, [tid("coa"), art, u, tid("hash")]);
  await q(`insert into exhibitions (id, user_id, title) values ($1, $2, 'betest cov show')`, [tid("exh"), u]);

  const paid = await makeBooking(u, await makeSlots(1), { status: "paid" });
  const payId = tid("rzp");
  await q(`insert into pw_payments (id, booking_id, provider, payment_id, amount_paise, status) values ($1, $2, 'razorpay', $3, 11800, 'captured')`, [tid("pay"), paid, payId]);
  await q(`insert into pw_refunds (id, booking_id, payment_id, amount_paise, status) values ($1, $2, $3, 100, 'processed')`, [tid("rf"), paid, payId]);
  await q(
    `insert into pw_invoices (id, booking_id, number, issue_date, place_of_supply, hsn_sac, gstin_supplier, net_paise, cgst_paise, sgst_paise, total_paise, line_items)
     values ($1, $2, $1, current_date, '08-Rajasthan', '997212', 'X', 10000, 900, 900, 11800, '[]')`,
    [tid("inv"), paid]
  );
  await q(
    `insert into pw_agreements (id, booking_id, artist_id, terms_version, terms_hash, body, total_amount_paise, signed_name)
     values ($1, $2, $3, 'v1', 'h', 'terms', 11800, $4)`,
    [tid("agr"), paid, u, user.name]
  );
  await q(`insert into pw_feedback (id, booking_id, artist_id, rating, note) values ($1, $2, $3, 5, 'lovely')`, [tid("fb"), paid, u]);
  await q(`insert into waitlist_entries (name, email, role, user_id) values ($1, $2, 'artist', $3)`, [user.name, user.email, u]);
  await q(`insert into pw_waitlist (id, name, contact, artist_id) values ($1, $2, $3, $4)`, [tid("wl"), user.name, user.email, u]);
  await q(`insert into survey_responses (email, user_id) values ($1, $2)`, [user.email, u]);
  await q(`insert into pw_notifications (id, user_id, recipient, subject, body, kind) values ($1, $2, $3, 's', 'b', 'system.notice')`, [tid("ntf"), u, user.email]);
  return user;
}

/** Every (table.column) holding `value`, across every text/jsonb/array column in the schema. */
async function whereIs(value: string): Promise<string[]> {
  const cols = await q<{ table_name: string; column_name: string }>(
    `select c.table_name, c.column_name
     from information_schema.columns c
     join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and c.data_type in ('text', 'character varying', 'jsonb', 'json', 'ARRAY')`
  );
  const byTable = new Map<string, string[]>();
  for (const c of cols) byTable.set(c.table_name, [...(byTable.get(c.table_name) ?? []), c.column_name]);

  const found: string[] = [];
  for (const [table, columns] of byTable) {
    const counts = columns.map((c, i) => `count(*) filter (where strpos("${c}"::text, $1) > 0)::int as c${i}`).join(", ");
    const [row] = await q<Record<string, number>>(`select ${counts} from "${table}"`, [value]);
    columns.forEach((c, i) => {
      if (row[`c${i}`] > 0) found.push(table === "user" ? `"user".${c}` : `${table}.${c}`);
    });
  }
  return found.sort();
}

describe("DPDP coverage (BE-2.20 – 2.22)", () => {
  let user: TestUser;

  it("export includes every data category for a seeded user (BE-2.21)", async () => {
    user = await seedEverything();
    actAs(user);
    const res = await exportMyData();
    if (!res.ok) throw new Error(res.message);
    const data = JSON.parse(res.json) as Record<string, unknown>;

    expect(data.account).toEqual([expect.objectContaining({ id: user.id, email: user.email })]);
    const categories = Object.entries(data).filter(([, v]) => Array.isArray(v));
    expect(categories.length).toBeGreaterThanOrEqual(19);
    const empty = categories.filter(([, v]) => (v as unknown[]).length === 0).map(([k]) => k);
    expect(empty).toEqual([]); // a category added to the export without a seed row here fails
    for (const [k, v] of categories) expect(JSON.stringify(v), k).not.toContain("doc_cloudinary_id");
  }, 120_000);

  it("after erasure the user id survives only in documented, pseudonymised records (BE-2.20)", async () => {
    // Before: the id is all over the schema.
    const before = await whereIs(user.id);
    expect(before.length).toBeGreaterThan(Object.keys(RETAINED_USER_REFERENCES).length);

    actAs(user);
    const f = new FormData();
    f.set("confirm", "DELETE");
    await expect(eraseMyData({ status: "idle" } as never, f)).rejects.toThrow("redirect:/physical-wall/account/erased");

    const after = await whereIs(user.id);
    const undocumented = after.filter((ref) => !(ref in RETAINED_USER_REFERENCES));
    expect(undocumented).toEqual([]);
    // And the email is nowhere at all.
    expect(await whereIs(user.email)).toEqual([]);
  }, 180_000);

  it("both requests are in the append-only request log, with timestamps (BE-2.22)", async () => {
    const log = await q<{ kind: string; event: string; at: Date }>(
      `select kind, event, at from pw_data_rights_requests where user_id = $1 order by at, event desc`,
      [user.id]
    );
    expect(log.map((r) => `${r.kind}:${r.event}`)).toEqual([
      "export:requested",
      "export:completed",
      "erasure:requested",
      "erasure:completed",
    ]);
    expect(log.every((r) => r.at instanceof Date)).toBe(true);

    await expect(q(`update pw_data_rights_requests set event = 'failed' where user_id = $1`, [user.id])).rejects.toThrow(/append-only/);
    await expect(q(`delete from pw_data_rights_requests where user_id = $1`, [user.id])).rejects.toThrow(/append-only/);
  });
});
