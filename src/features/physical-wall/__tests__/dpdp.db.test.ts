import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { actAs, type TestUser } from "@/test/db-setup";
import { makeArtwork, makeBooking, makeProfile, makeSlots, makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import { eraseMyData, exportMyData } from "@/features/physical-wall/actions/account";
import { inTransaction } from "@/features/physical-wall/actions/shared";
import { eraseUserIn, processAssetDeletions } from "@/features/physical-wall/data-rights";

// Real Cloudinary: uploads a 1x1 PNG under artwall/betest/ and checks erasure deletes it.
const cloud = process.env.CLOUDINARY_CLOUD_NAME!;
const apiKey = process.env.CLOUDINARY_API_KEY!;
const apiSecret = process.env.CLOUDINARY_API_SECRET!;
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function upload(publicId: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHash("sha1").update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`).digest("hex");
  const body = new URLSearchParams({ file: PNG, public_id: publicId, timestamp, api_key: apiKey, signature });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body });
  expect(res.status, await res.clone().text()).toBe(200);
}

async function exists(publicId: string) {
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/image/upload/${publicId}`, {
    headers: { authorization: `Basic ${auth}` },
  });
  return res.status === 200;
}

async function richUser() {
  const user = await makeUser();
  await makeProfile(user.id);
  const artId = `artwall/betest/art_${Date.now()}`;
  const docId = `artwall/betest/doc_${Date.now()}`;
  await Promise.all([upload(artId), upload(docId)]);
  const art = await makeArtwork(user.id, { imagePublicId: artId });

  await q(`insert into session (id, "userId", token, "expiresAt", "createdAt", "updatedAt") values ($1, $2, $1, now() + interval '1 day', now(), now())`, [tid("sess"), user.id]);
  await q(`insert into account (id, "userId", "accountId", "providerId", "createdAt", "updatedAt") values ($1, $2, '1234567890', 'google', now(), now())`, [tid("acc"), user.id]);
  await q(`insert into pw_identity_verifications (id, user_id, doc_cloudinary_id, doc_kind) values ($1, $2, $3, 'pan')`, [tid("idv"), user.id, docId]);
  await q(`insert into pw_consents (id, user_id, purpose, granted, notice_version) values ($1, $2, 'account', true, 'v1')`, [tid("con"), user.id]);
  const ugcConsent = tid("con");
  await q(`insert into pw_consents (id, user_id, purpose, granted, notice_version) values ($1, $2, 'ugc_publication', true, 'v1')`, [ugcConsent, user.id]);
  await q(
    `insert into pw_ugc_submissions (id, user_id, cloudinary_id, url, caption, status, kind, consent_id)
     values ($1, $2, $3, 'https://x', 'betest ugc', 'pending', 'selfie', $4)`,
    [tid("ugc"), user.id, `artwall/ugc/betest_gone_${Date.now()}`, ugcConsent]
  );
  await q(`insert into pw_grievances (id, user_id, contact, subject, body, due_at) values ($1, $2, $3, 'betest', 'my phone is 98xxxx', now())`, [tid("gr"), user.id, user.email]);

  const paid = await makeBooking(user.id, await makeSlots(1), { status: "paid" });
  await q(`insert into pw_payments (id, booking_id, provider, payment_id, amount_paise, status) values ($1, $2, 'razorpay', $3, 11800, 'captured')`, [tid("pay"), paid, tid("rzp")]);
  await q(
    `insert into pw_invoices (id, booking_id, number, issue_date, place_of_supply, hsn_sac, gstin_supplier, net_paise, cgst_paise, sgst_paise, total_paise, line_items)
     values ($1, $2, $1, current_date, '08-Rajasthan', '997212', 'X', 10000, 900, 900, 11800, '[]')`,
    [tid("inv"), paid]
  );
  await q(
    `insert into pw_agreements (id, booking_id, artist_id, terms_version, terms_hash, body, total_amount_paise, signed_name)
     values ($1, $2, $3, 'v1', 'h', 'terms', 11800, $4)`,
    [tid("agr"), paid, user.id, user.name]
  );
  // Rows under the append-only guards (0028/0029/0032): erasure must get past them, and only as designed.
  const [{ slot_id: paidSlot }] = await q<{ slot_id: string }>(`select slot_id from pw_booking_slots where booking_id = $1`, [paid]);
  const damage = tid("dmg");
  await q(
    `insert into pw_damage_records (id, booking_id, slot_id, item_key, description, artwork_id, recorded_by)
     values ($1, $2, $3, 'front', 'scratch', $4, $5)`,
    [damage, paid, paidSlot, art, user.id]
  );
  const [{ id: audit }] = await q<{ id: string }>(
    `insert into pw_audit_log (actor_id, actor_label, action, subject_type, subject_id)
     values ($1, $2, 'betest.action', 'booking', $3) returning id`,
    [user.id, user.name, paid]
  );
  const tag = tid("tag");
  await q(`insert into art_tags (id, tag_uid, artwork_id, bound_by, bound_at) values ($1, $1, $2, $3, now())`, [tag, art, user.id]);
  await q(
    `insert into pw_ledger (id, type, category, amount_paise, source_ref, booking_id, created_by)
     values ($1, 'revenue', 'booking', 11800, $1, $2, $3)`,
    [tid("led"), paid, user.id]
  );
  await q(`update artworks set price_paise = 50000 where id = $1`, [art]); // a second price-history row

  const heldSlots = await makeSlots(1);
  const held = await makeBooking(user.id, heldSlots);

  actAs(user);
  const { createExhibition } = await import("@/features/exhibitions/actions");
  const { issueCertificate } = await import("@/features/coa/actions");
  await createExhibition({ title: "betest exh" });
  await issueCertificate(art);
  return { user, art, artId, docId, paid, held, heldSlot: heldSlots[0], damage, audit, tag };
}

const count = async (sql: string, params: unknown[]) => (await q(sql, params)).length;

afterAll(purgeTestData);

describe("DPDP export (BE-1.27)", () => {
  it("includes artworks, identity-doc metadata, payments, invoices and UGC", async () => {
    const { user } = await richUser();
    actAs(user);
    const res = await exportMyData();
    expect(res.ok).toBe(true);
    const data = JSON.parse((res as { json: string }).json);
    expect(data.artworks).toHaveLength(1);
    expect(data.identityDocuments[0]).toMatchObject({ doc_kind: "pan" });
    expect(data.identityDocuments[0]).not.toHaveProperty("doc_cloudinary_id");
    expect(data.payments).toHaveLength(1);
    expect(data.invoices).toHaveLength(1);
    expect(data.ugcSubmissions).toHaveLength(1);
    expect(data.certificates).toHaveLength(1);
  }, 120_000);
});

describe("DPDP erasure (BE-1.28 – 1.33)", () => {
  it("is one transaction: a failure after eraseUserIn changes nothing", async () => {
    const { user } = await richUser();
    await expect(
      inTransaction(async (client) => {
        await eraseUserIn(client, user.id);
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(await count(`select 1 from session where "userId" = $1`, [user.id])).toBe(1);
    expect(await count(`select 1 from artworks where "userId" = $1`, [user.id])).toBe(1);
    expect((await q<{ email: string }>(`select email from "user" where id = $1`, [user.id]))[0].email).toBe(user.email);
  }, 120_000);

  it("deletes personal data, sessions, OAuth links and Cloudinary files; keeps tax/contract records pseudonymised", async () => {
    const r = await richUser();
    const u: TestUser = r.user;
    actAs(u);
    const f = new FormData();
    f.set("confirm", "DELETE");
    // Success redirects to the confirmation page (sessions are gone, so the
    // account page itself would bounce to sign-in); redirect() throws.
    await expect(eraseMyData({ status: "idle" } as never, f)).rejects.toThrow(
      "redirect:/physical-wall/account/erased"
    );

    // Gone
    for (const [sql, label] of [
      [`select 1 from session where "userId" = $1`, "sessions"],
      [`select 1 from account where "userId" = $1`, "oauth accounts"],
      [`select 1 from artist_profiles where "userId" = $1`, "profile"],
      [`select 1 from artworks where "userId" = $1`, "artworks"],
      [`select 1 from pw_identity_verifications where user_id = $1`, "identity docs"],
      [`select 1 from pw_ugc_submissions where user_id = $1`, "ugc"],
      [`select 1 from exhibitions where user_id = $1`, "exhibitions"],
      [`select 1 from coa_certificates where user_id = $1`, "certificates"],
    ] as const) {
      expect(await count(sql, [u.id]), label).toBe(0);
    }

    // Kept, pseudonymised
    const [user] = await q<{ name: string; email: string }>(`select name, email from "user" where id = $1`, [u.id]);
    expect(user.name).toBe("Deleted account");
    expect(user.email).toMatch(/@removed\.artwalllabs\.com$/);
    expect(await count(`select 1 from pw_bookings where id = $1 and status = 'paid'`, [r.paid])).toBe(1);
    expect(await count(`select 1 from pw_payments where booking_id = $1`, [r.paid])).toBe(1);
    expect(await count(`select 1 from pw_invoices where booking_id = $1`, [r.paid])).toBe(1);
    const [agr] = await q<{ signed_name: string }>(`select signed_name from pw_agreements where booking_id = $1`, [r.paid]);
    expect(agr.signed_name).toMatch(/^Erased user /);
    const [gr] = await q<{ body: string; contact: string }>(`select body, contact from pw_grievances where user_id = $1`, [u.id]);
    expect(gr).toEqual({ body: "[erased]", contact: "[erased]" });
    expect(await count(`select 1 from pw_consents where user_id = $1 and withdrawn_at is null`, [u.id])).toBe(0);

    // Append-only records: kept, and changed only in the ways erasure is allowed to.
    expect(await count(`select 1 from pw_ledger where booking_id = $1`, [r.paid])).toBe(1);
    const [dmg] = await q(`select artwork_id, description from pw_damage_records where id = $1`, [r.damage]);
    expect(dmg).toEqual({ artwork_id: null, description: "scratch" });
    const [audit] = await q<{ actor_id: string; actor_label: string; action: string }>(
      `select actor_id, actor_label, action from pw_audit_log where id = $1`,
      [r.audit]
    );
    expect(audit).toMatchObject({ actor_id: u.id, action: "betest.action" });
    expect(audit.actor_label).toMatch(/^Erased user /);
    const [tag] = await q(`select artwork_id, bound_by, bound_at from art_tags where id = $1`, [r.tag]);
    expect(tag).toEqual({ artwork_id: null, bound_by: null, bound_at: null });
    for (const t of ["provenance_events", "artwork_ownership_history", "artwork_price_history", "coa_certificates"]) {
      expect(await count(`select 1 from ${t} where artwork_id = $1`, [r.art]), t).toBe(0);
    }

    // The live hold is released
    expect((await q<{ status: string }>(`select status from pw_bookings where id = $1`, [r.held]))[0].status).toBe("cancelled");
    expect((await q<{ state: string }>(`select state from pw_slots where id = $1`, [r.heldSlot]))[0].state).toBe("available");

    // Cloudinary files actually deleted
    const del = await q<{ public_id: string; status: string }>(
      `select public_id, status from pw_asset_deletions where public_id = any($1)`,
      [[r.artId, r.docId]]
    );
    expect(del.map((d) => d.status)).toEqual(["done", "done"]);
    expect(await exists(r.artId)).toBe(false);
    expect(await exists(r.docId)).toBe(false);
  }, 180_000);

  it("a failed Cloudinary delete stays queued with its error and succeeds on retry", async () => {
    const publicId = `artwall/betest/retry_${Date.now()}`;
    await upload(publicId);
    await q(`insert into pw_asset_deletions (id, public_id, reason) values ($1, $2, 'betest')`, [tid("ad"), publicId]);

    const real = process.env.CLOUDINARY_API_SECRET;
    process.env.CLOUDINARY_API_SECRET = "wrong";
    try {
      await processAssetDeletions();
    } finally {
      process.env.CLOUDINARY_API_SECRET = real;
    }
    let [row] = await q<{ status: string; attempts: number; last_error: string }>(
      `select status, attempts, last_error from pw_asset_deletions where public_id = $1`,
      [publicId]
    );
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(1);
    expect(row.last_error).toMatch(/Cloudinary/);
    expect(await exists(publicId)).toBe(true);

    await processAssetDeletions();
    [row] = await q(`select status, attempts, last_error from pw_asset_deletions where public_id = $1`, [publicId]);
    expect(row.status).toBe("done");
    expect(await exists(publicId)).toBe(false);
    await q(`delete from pw_asset_deletions where public_id = $1`, [publicId]);
  }, 120_000);
});
