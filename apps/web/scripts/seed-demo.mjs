/**
 * Seed the demo/dummy dataset: one account per Bible persona and admin role,
 * artworks covering all six valid artwork paths, a WallOS hierarchy, demand
 * signals, orders on both the escrow and direct paths, and append-only
 * provenance chains.
 *
 * NEVER RUNS AGAINST PRODUCTION. The target host is checked against the
 * production endpoint before a single statement is sent (scripts/seed-guard.mjs),
 * and the URL comes from SEED_DATABASE_URL so it cannot be inherited from
 * apps/web/.env by accident.
 *
 *   SEED_DATABASE_URL='postgres://...branch.../neondb' node scripts/seed-demo.mjs
 *   SEED_DATABASE_URL='...' node scripts/seed-demo.mjs --purge
 *
 * Idempotent. Every row this script writes has an id prefixed `seed_`, so a
 * purge is one delete per table and re-running updates in place rather than
 * duplicating. Seeded rows are otherwise ORDINARY rows: no application code
 * special-cases the prefix, so the data flows through the real policy engine,
 * eligibility matrix and invariants exactly like a real artist's work.
 *
 * Credentials are written to SEED-CREDENTIALS.md at the repo root (gitignored)
 * and never printed.
 */
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import pg from "pg";
/**
 * Demo accounts are created through Supabase Auth's Admin API, not by writing
 * a password hash into `account` as this script used to. Supabase Auth owns
 * credentials now (migration 0074), and its scrypt-incompatible hashes mean a
 * locally written hash would simply never authenticate.
 *
 * The uuid must come FROM auth.users: `public."user"` is keyed by it, and the
 * `handle_new_user` trigger creates that profile row on insert. This script
 * then updates the row with the role/persona columns the trigger never touches.
 */
async function createAuthUser({ email, password, name }) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to seed accounts."
    );
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const res = await fetch(`${base}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name } }),
  });
  if (res.ok) return (await res.json()).id;

  // Re-running the seed must be idempotent, so an existing email is looked up
  // and its password reset rather than treated as a failure.
  const body = await res.text();
  if (!/already|exists|registered/i.test(body)) {
    throw new Error(`Could not create ${email}: ${res.status} ${body.slice(0, 200)}`);
  }
  const list = await fetch(`${base}/auth/v1/admin/users?per_page=1000`, { headers });
  const found = (await list.json()).users?.find((u) => u.email === email);
  if (!found) throw new Error(`${email} reported as existing but was not found.`);
  await fetch(`${base}/auth/v1/admin/users/${found.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ password, email_confirm: true, user_metadata: { name } }),
  });
  return found.id;
}

import { resolveSeedTarget } from "./seed-guard.mjs";

const PURGE = process.argv.includes("--purge");
const { url, host } = resolveSeedTarget();

const pool = new pg.Pool({ connectionString: url });
/** Tagged-template helper over the pg pool, so the SQL below reads like SQL. */
const sql = async (strings, ...values) =>
  (
    await pool.query(
      strings.reduce((t, part, i) => t + part + (i < values.length ? `$${i + 1}` : ""), ""),
      values
    )
  ).rows;

/** Rupees to integer paise. Every money column in this codebase is paise. */
const rs = (rupees) => Math.round(rupees * 100);
const P = "seed_";
const id = (...parts) => P + parts.join("_");

/* ── Purge ──────────────────────────────────────────────────────────────────
 * Child-before-parent. Tables whose primary key is not a text id (generated
 * identity, or composite) are purged by their seeded foreign key instead. */
const PURGE_STEPS = [
  `delete from order_refunds where id like '${P}%'`,
  `delete from payouts where id like '${P}%'`,
  `delete from escrow_releases where id like '${P}%'`,
  `delete from escrow_holds where id like '${P}%'`,
  `delete from order_payments where id like '${P}%'`,
  `delete from order_events where order_id like '${P}%'`,
  `delete from order_items where id like '${P}%'`,
  `delete from seller_orders where id like '${P}%'`,
  `delete from orders where id like '${P}%'`,
  `delete from cart_items where user_id like '${P}%'`,
  `delete from demand_aggregates where artwork_id like '${P}%'`,
  `delete from art_tag_scans where id like '${P}%'`,
  `delete from art_tags where id like '${P}%'`,
  `delete from curator_picks where id like '${P}%'`,
  `delete from exhibition_artworks where exhibition_id like '${P}%'`,
  `delete from exhibitions where id like '${P}%'`,
  `delete from mint_commitments where id like '${P}%'`,
  `delete from merkle_roots where id like '${P}%'`,
  `delete from editions where id like '${P}%'`,
  `delete from pw_qr_tokens where token like '${P}%'`,
  `delete from slots where id like '${P}%'`,
  `delete from walls where id like '${P}%'`,
  `delete from rooms_zones where id like '${P}%'`,
  `delete from floors where id like '${P}%'`,
  `delete from buildings where id like '${P}%'`,
  `delete from venues where id like '${P}%'`,
  `delete from organizations where id like '${P}%'`,
  `delete from artworks where id like '${P}%'`,
  `delete from curators where id like '${P}%'`,
  `delete from artist_profiles where "userId" like '${P}%'`,
  // admin_role_assignments is append-only: a grant is a permanent audit record
  // (Rule 47), and its trigger refuses DELETE. The product itself never
  // deletes a grant either — revokeAdminRole sets revoked_at
  // (features/physical-wall/actions/admin-roles.ts). So the purge revokes,
  // exactly as an admin clicking "revoke" would, leaving the audit trail
  // intact and the role no longer effective (every check filters on
  // revoked_at is null). The row has no FK to "user", so it survives the
  // account deletion below as a tombstone, which is the intent.
  `update admin_role_assignments set revoked_at = now()
     where id like '${P}%' and revoked_at is null`,
  `delete from account where id like '${P}%'`,
  `delete from session where "userId" like '${P}%'`,
  `delete from "user" where id like '${P}%'`,
];

/**
 * The append-only tables, deleted per-owner while `artwall.erasing_user` is
 * set to that owner. Each takes ($1 = the seed id prefix, $2 = that user id)
 * so a row is removed only when it is BOTH seeded and owned by the user whose
 * erasure is currently in effect — the same two conditions the trigger checks.
 */
const ERASURE_STEPS = [
  `delete from provenance_events
     where id like $1
       and exists (select 1 from artworks a where a.id = artwork_id and a."userId" = $2)`,
  `delete from exhibition_transitions
     where exhibition_id like $1
       and exists (select 1 from exhibitions e where e.id = exhibition_id and e.user_id = $2)`,
  // coa_certificates refuses DELETE for any non-draft certificate unless the
  // erasing user owns it (same trigger family). So it must be deleted inside
  // its own owner's erasure pass, not in the generic sweep afterwards.
  `delete from coa_certificates
     where id like $1
       and (user_id = $2
            or exists (select 1 from artworks a where a.id = artwork_id and a."userId" = $2))`,
];

/**
 * demand_signals is the one table a purge CANNOT empty.
 *
 * Its trigger (demand_signals_append_only, migration 0045) raises on UPDATE
 * and DELETE unconditionally — unlike provenance_events and
 * exhibition_transitions, it has no erasing-user escape hatch, and the app's
 * own DPDP erasure path does not delete from it either. The table also has no
 * foreign key to artworks, so it is orphan-tolerant by design: rows survive
 * the artwork they describe, carrying only (artwork_id, signal_type, weight) —
 * no personal data.
 *
 * So the purge removes the artwork and its aggregate, and leaves these rows as
 * anonymous analytics pointing at an id that no longer resolves. That is the
 * schema's intent, not a purge failure. Emptying them would mean disabling a
 * production invariant, which this script will not do.
 */
const UNPURGEABLE_NOTE =
  "demand_signals rows are append-only with no erasure hatch (migration 0045) and are left in place;\n" +
  "  they hold no personal data and no FK, and their artwork_id no longer resolves.";

/**
 * Purge every seeded row.
 *
 * Runs in ONE transaction with `artwall.erasing_user` set, because several of
 * these tables (provenance_events, demand_signals, exhibition_transitions) are
 * append-only at the database level — a trigger refuses UPDATE and DELETE
 * (Invariant 7, Rule 43). The sanctioned way to remove such a row is the DPDP
 * erasure path the app itself uses (features/physical-wall/data-rights.ts):
 * set the erasing user, then delete rows that user owns. We do not disable a
 * trigger or bypass the invariant — we use the same escape hatch the product's
 * own "delete my account" flow uses, once per seeded user.
 */
async function purge() {
  const client = await pool.connect();
  let total = 0;
  try {
    await client.query("BEGIN");

    const { rows: seededUsers } = await client.query(
      `select id from "user" where id like $1`,
      [`${P}%`]
    );

    // Append-only tables first, each under its owner's erasure flag.
    for (const { id: userId } of seededUsers) {
      await client.query(`select set_config('artwall.erasing_user', $1, true)`, [userId]);
      for (const statement of ERASURE_STEPS) {
        try {
          const result = await client.query(statement, [`${P}%`, userId]);
          total += result.rowCount ?? 0;
        } catch (error) {
          if (error.code === "42P01") continue;
          throw error;
        }
      }
    }

    // The erasure flag stays set for the rest of the transaction, which is
    // what lets any remaining owner-scoped append-only row go too.
    for (const statement of PURGE_STEPS) {
      const table = statement.match(/(?:delete from|update) ("?\w+"?)/)[1];
      try {
        const result = await client.query(statement);
        if (result.rowCount) console.log(`  - ${table}: ${result.rowCount}`);
        total += result.rowCount ?? 0;
      } catch (error) {
        // A table that does not exist on this database is not a purge failure.
        if (error.code === "42P01") continue;
        throw error;
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  console.log(`\nPurged ${total} seeded row(s). Nothing with a non-"${P}" id was touched.`);
  console.log(`\nNote: ${UNPURGEABLE_NOTE}`);
}

/* ── Accounts ─────────────────────────────────────────────────────────────── */

/**
 * `role` is the flat internal access tier (visitor|artist|staff|admin), NOT a
 * persona. `persona` is user.onboarding_persona. `adminRole` is the third,
 * additive axis (admin_role_assignments) — granting one also sets
 * role = 'admin', because the admin area's page-level gate checks that column
 * too (AGENTS.md).
 */
const ACCOUNTS = [
  // ── Artists, by Bible verification level (section 4) ──
  {
    key: "artist_a0",
    email: "artist.a0@artwall.test",
    name: "Devika Rao",
    role: "artist",
    persona: "artist",
    artistLevel: "A0",
    identityVerified: false,
    verificationStatus: "unverified",
    purpose:
      "Artist A0, unverified — proves primary listing is BLOCKED (eligibility matrix row 1)",
    screens: "/studio, /studio/verification, /studio/artworks (listing refused with a reason code)",
  },
  {
    key: "artist_a1",
    email: "artist.a1@artwall.test",
    name: "Priya Sharma",
    role: "artist",
    persona: "artist",
    artistLevel: "A1",
    identityVerified: true,
    verificationStatus: "approved",
    purpose: "Artist A1, identity verified — primary listing allowed, exhibition blocked",
    screens: "/studio, /studio/artworks, /discover, artwork detail trust panel",
  },
  {
    key: "artist_a2",
    email: "artist.a2@artwall.test",
    name: "Imran Qureshi",
    role: "artist",
    persona: "artist",
    artistLevel: "A2",
    identityVerified: true,
    verificationStatus: "approved",
    purpose: "Artist A2, portfolio verified — primary listing allowed, portfolio badge",
    screens: "/studio, /artist/<handle>, /discover",
  },
  {
    key: "artist_a4",
    email: "artist.a4@artwall.test",
    name: "Meenakshi Iyer",
    role: "artist",
    persona: "artist",
    artistLevel: "A4",
    identityVerified: true,
    verificationStatus: "approved",
    purpose:
      "Artist A4, curator verified — owns the fully-enabled artwork (exhibition + secondary + royalty all live)",
    screens: "/studio/artworks/<id> control center, /studio/exhibitions, /studio/earnings",
  },
  // ── Buyers and collectors ──
  {
    key: "buyer_first",
    email: "buyer.first@artwall.test",
    name: "Ananya Krishnan",
    role: "visitor",
    persona: "buyer",
    purpose: "First-time buyer, order_count == 0 — escrow pre-selected per section A1",
    screens: "/checkout (escrow pre-selected), /dashboard, /wishlist",
  },
  {
    key: "buyer_repeat",
    email: "buyer.repeat@artwall.test",
    name: "Rohit Mehta",
    role: "visitor",
    persona: "buyer",
    purpose: "Repeat buyer, has a completed order — direct-purchase path available",
    screens: "/checkout (direct available), /orders/<id>, /collection",
  },
  {
    key: "nri_collector",
    email: "collector.nri@artwall.test",
    name: "Arjun Nair",
    role: "visitor",
    persona: "buyer",
    identityVerified: true,
    purpose: "NRI Collector, KYC verified — owned portfolio, re-exhibition, secondary listing",
    screens: "/collection, /my-collections, /offer/<artworkId>",
  },
  // ── Curator / gallery ──
  {
    key: "curator",
    email: "curator@artwall.test",
    name: "Meera Desai",
    role: "visitor",
    persona: "curator",
    identityVerified: true,
    curator: { commissionBps: 1000, status: "active" },
    purpose: "Curator, verified — collections, commission attribution, curator picks",
    screens: "/curator/dashboard, /curator/collections, /curator/<slug>",
  },
  {
    key: "gallery",
    email: "gallery@artwall.test",
    name: "Gallery Ensemble Mumbai",
    role: "visitor",
    persona: "curator",
    identityVerified: true,
    curator: { commissionBps: 1500, status: "active" },
    purpose:
      "Gallery, verified — consignment at 15% (section A15), facilitator attribution, team roles",
    screens: "/curator/dashboard, /curator/analytics",
  },
  // ── WallOS people. Three DISTINCT roles: Locked Rules 34 and 35. ──
  {
    key: "venue_basic",
    email: "venue.basic@artwall.test",
    name: "Rajesh Agarwal",
    role: "visitor",
    persona: "buyer",
    identityVerified: true,
    wallos: "Venue Owner — WaaS Basic",
    purpose:
      "Venue Owner on WaaS Basic (free + 2.5% revenue share). Owns the seeded organization and venue",
    screens: "/venue, /venue/walls, /venue/calendar (route tree not built yet — see docs/runbooks/SEED-DATA.md)",
  },
  {
    key: "venue_pro",
    email: "venue.pro@artwall.test",
    name: "Sunita Bhandari",
    role: "visitor",
    persona: "buyer",
    identityVerified: true,
    wallos: "Venue Owner — WaaS Pro",
    purpose: "Venue Owner on WaaS Pro (Rs 999/mo + 5%)",
    screens: "/venue, /venue/analytics",
  },
  {
    key: "venue_enterprise",
    email: "venue.enterprise@artwall.test",
    name: "Vikram Singhania",
    role: "visitor",
    persona: "buyer",
    identityVerified: true,
    wallos: "Venue Owner — WaaS Enterprise",
    purpose: "Venue Owner on WaaS Enterprise (Rs 4,999/mo + 8%)",
    screens: "/venue, /venue/settings",
  },
  {
    key: "wall_manager",
    email: "wall.manager@artwall.test",
    name: "Kavya Reddy",
    role: "staff",
    persona: "buyer",
    identityVerified: true,
    wallos: "Wall Manager",
    purpose:
      "Wall Manager (section 13, Locked Rule 34) — distinct from Venue Owner. Multi-venue ops",
    screens: "/physical-wall/ops, install queue, check-ins",
  },
  {
    key: "wall_consultant",
    email: "wall.consultant@artwall.test",
    name: "Farhan Sheikh",
    role: "staff",
    persona: "buyer",
    identityVerified: true,
    wallos: "Wall Consultant",
    purpose: "Wall Consultant (Locked Rule 35) — advisory only, distinct from Wall Manager",
    screens: "/physical-wall/ops (advisory surfaces)",
  },
  // ── The eight Bible admin roles (section 24 / section 61) ──
  {
    key: "admin_super",
    email: "admin.super@artwall.test",
    name: "Super Admin (seed)",
    role: "admin",
    adminRole: "super_admin",
    purpose: "Super Admin — full platform control, bypasses every role check",
    screens: "/physical-wall/admin and every console section",
  },
  {
    key: "admin_ops",
    email: "admin.operations@artwall.test",
    name: "Operations Admin (seed)",
    role: "admin",
    adminRole: "operations_admin",
    purpose: "Operations — bookings, install queue, calendar. Must see ONLY these",
    screens: "/physical-wall/admin/console/operations-admin",
  },
  {
    key: "admin_finance",
    email: "admin.finance@artwall.test",
    name: "Finance Admin (seed)",
    role: "admin",
    adminRole: "finance_admin",
    purpose: "Finance — ledger, payouts, commission policy",
    screens: "/physical-wall/admin/console/finance-admin",
  },
  {
    key: "admin_content",
    email: "admin.content@artwall.test",
    name: "Content Admin (seed)",
    role: "admin",
    adminRole: "content_admin",
    purpose: "Content — artwork and UGC moderation",
    screens: "/physical-wall/admin/console/content-admin",
  },
  {
    key: "admin_support",
    email: "admin.support@artwall.test",
    name: "Support Admin (seed)",
    role: "admin",
    adminRole: "support_admin",
    purpose: "Support — grievances, customer support actions",
    screens: "/physical-wall/admin/console/support-admin",
  },
  {
    key: "admin_analytics",
    email: "admin.analytics@artwall.test",
    name: "Analytics Admin (seed)",
    role: "admin",
    adminRole: "analytics_admin",
    purpose: "Analytics — read-only dashboards, no write actions",
    screens: "/physical-wall/admin/console/analytics-admin",
  },
  {
    key: "admin_wallnet",
    email: "admin.wallnetwork@artwall.test",
    name: "Wall Network Admin (seed)",
    role: "admin",
    adminRole: "venue_admin",
    purpose:
      "Wall Network — the Bible's name for venue_admin (1:1). WallOS hierarchy, venue ops",
    screens: "/physical-wall/admin/console/wall-network-admin, /physical-wall/admin/wallos",
  },
  {
    key: "admin_blockchain",
    email: "admin.blockchain@artwall.test",
    name: "Blockchain Admin (seed)",
    role: "admin",
    adminRole: "blockchain_admin",
    purpose: "Blockchain — Merkle root posting status, tag binding",
    screens: "/physical-wall/admin/console/blockchain-admin",
  },
];

/** A distinct random password per account. Never a shared literal. */
const newPassword = () => `Aw-${randomBytes(12).toString("base64url")}`;

async function seedAccounts() {
  const credentials = [];

  for (const acct of ACCOUNTS) {
    const password = newPassword();
    const userId = await createAuthUser({
      email: acct.email,
      password,
      name: acct.name,
    });

    // An account holding any admin role must also carry role = 'admin': the
    // admin area's page-level gate checks that column as well as the role
    // assignment.
    const role = acct.adminRole ? "admin" : acct.role;

    await sql`
      insert into "user" (
        id, name, email, "emailVerified", role, onboarding_persona,
        identity_verified, artist_verification_status, "ageDeclaredAdult",
        "onboardedAt", "createdAt", "updatedAt"
      ) values (
        ${userId}, ${acct.name}, ${acct.email}, true, ${role}, ${acct.persona ?? null},
        ${acct.identityVerified ?? false}, ${acct.verificationStatus ?? "unverified"}, true,
        now(), now(), now()
      )
      on conflict (id) do update set
        name = excluded.name, email = excluded.email, role = excluded.role,
        onboarding_persona = excluded.onboarding_persona,
        identity_verified = excluded.identity_verified,
        artist_verification_status = excluded.artist_verification_status,
        "updatedAt" = now()
    `;

    // No `account` row: Supabase Auth holds the credential, and `account` is a
    // kept-but-empty better-auth leftover (migration 0074). These accounts sign
    // in through the normal /sign-in form, no special-casing.

    if (acct.persona === "artist") {
      await sql`
        insert into artist_profiles (
          "userId", handle, "displayName", discipline, location, bio, published,
          "publishedAt", "onboardingCompleted", "createdAt", "updatedAt"
        ) values (
          ${userId}, ${`seed-${acct.key.replace(/_/g, "-")}`}, ${acct.name},
          'Painting', 'Jaipur, Rajasthan',
          ${`Seed demo artist at verification level ${acct.artistLevel}.`},
          true, now(), true, now(), now()
        )
        on conflict ("userId") do update set
          "displayName" = excluded."displayName", published = true, "updatedAt" = now()
      `;
    }

    if (acct.curator) {
      await sql`
        insert into curators (id, user_id, display_name, bio, commission_bps, status, created_at)
        values (
          ${id("cur", acct.key)}, ${userId}, ${acct.name},
          ${acct.purpose}, ${acct.curator.commissionBps}, ${acct.curator.status}, now()
        )
        on conflict (id) do update set
          commission_bps = excluded.commission_bps, status = excluded.status
      `;
    }

    if (acct.adminRole) {
      const [roleRow] = await sql`select id from admin_roles where name = ${acct.adminRole} limit 1`;
      if (!roleRow) throw new Error(`admin_roles has no row named "${acct.adminRole}"`);
      await sql`
        insert into admin_role_assignments (id, user_id, role_id, granted_by, granted_at)
        values (${id("ara", acct.key)}, ${userId}, ${roleRow.id}, null, now())
        on conflict (id) do update set revoked_at = null, revoked_by = null
      `;
    }

    credentials.push({ ...acct, userId, password });
  }

  return credentials;
}

/* ── Artworks: all six valid paths (section 21, sections 159-164) ─────────────
 *
 * Each path is a different combination of the five trust dimensions, which the
 * policy engine reads live from coa_certificates / mint_commitments /
 * art_tags / art_tag_scans / curator_picks (features/policy/trust.ts). So a
 * path is seeded by writing those rows, never by setting a status field — the
 * engine computes the eligibility itself, exactly as it would for real data.
 *
 * Levels (features/policy/levels.ts):
 *   COA issued                      -> P1
 *   a mint_commitments row          -> P2
 *   that commitment status='minted' -> P3   (canExhibit needs P >= P3)
 *   COA status='minted'             -> P4
 *   art_tags.bound_at not null      -> B2   (canExhibit needs B >= B2)
 *   + an art_tag_scans row          -> B3
 */
const ARTWORKS = [
  {
    key: "path1",
    path: 1,
    owner: "artist_a1",
    title: "Monsoon Over Amber",
    medium: "Acrylic on canvas",
    dimensions: "60 x 90 cm",
    year: 2025,
    category: "painting",
    pricePaise: rs(18_000),
    commerceStatus: "listed",
    lifecycleStatus: "published",
    coa: null,
    mint: null,
    bind: null,
    curatorPick: true,
    note: "Path 1 (section 161): no COA -> verification -> primary listing. Primary allowed; exhibition and secondary blocked.",
  },
  {
    key: "path2",
    path: 2,
    owner: "artist_a2",
    title: "Thar Noon",
    medium: "Oil on linen",
    dimensions: "45 x 60 cm",
    year: 2024,
    category: "painting",
    pricePaise: rs(42_500),
    commerceStatus: "listed",
    lifecycleStatus: "published",
    coa: { status: "issued", level: 1 },
    mint: null,
    bind: null,
    curatorPick: true,
    note: "Path 2 (section 162): holographic COA, no blockchain -> primary sale only. Holographic COA != blockchain provenance (Rule 7).",
  },
  {
    key: "path3",
    path: 3,
    owner: "artist_a4",
    title: "Ledger of Small Gods",
    medium: "Mixed media on board",
    dimensions: "75 x 75 cm",
    year: 2025,
    category: "mixed-media",
    pricePaise: rs(1_85_000),
    commerceStatus: "listed",
    lifecycleStatus: "published",
    coa: { status: "issued", level: 2 },
    mint: { status: "minted" },
    bind: null,
    curatorPick: true,
    note: "Path 3 (section 163): blockchain, no exhibition -> primary + secondary + royalty. Exhibition still blocked: no binding (Rule 17).",
  },
  {
    key: "path4",
    path: 4,
    owner: "artist_a4",
    title: "Blue Hour, Nahargarh",
    medium: "Archival pigment print",
    dimensions: "50 x 70 cm",
    year: 2025,
    category: "photography",
    pricePaise: rs(65_000),
    commerceStatus: "listed",
    lifecycleStatus: "published",
    coa: { status: "issued", level: 2 },
    mint: { status: "minted" },
    bind: { tagType: "nfc", scanned: true },
    curatorPick: true,
    note: "Path 4 (section 164): binding + blockchain, NOT exhibiting. All four eligible; exhibition only when the artist chooses (Rule 16).",
  },
  {
    key: "path5",
    path: 5,
    owner: "artist_a4",
    title: "The Weaver's Arithmetic",
    medium: "Natural dye on cotton",
    dimensions: "120 x 90 cm",
    year: 2024,
    category: "textile",
    pricePaise: rs(3_20_000),
    commerceStatus: "sold",
    lifecycleStatus: "published",
    exhibitionStatus: "on_display",
    coa: { status: "issued", level: 3 },
    mint: { status: "minted" },
    bind: { tagType: "nfc", scanned: true },
    curatorPick: true,
    exhibit: true,
    note: "Path 5 (section 159): exhibition -> demand -> threshold -> sale, full revenue distribution. Exhibition legal: B3 + P3 (Rules 17-18).",
  },
  {
    key: "path6",
    path: 6,
    owner: "artist_a2",
    title: "Unsold Inventory of Dreams",
    medium: "Charcoal on paper",
    dimensions: "40 x 55 cm",
    year: 2023,
    category: "drawing",
    pricePaise: rs(9_500),
    commerceStatus: "unlisted",
    lifecycleStatus: "published",
    exhibitionStatus: "returned",
    coa: { status: "issued", level: 1 },
    mint: { status: "minted" },
    bind: { tagType: "qr", scanned: true },
    curatorPick: false,
    exhibit: true,
    note: "Path 6 (section 160): exhibition -> insufficient demand -> rotation -> return. No commerce required.",
  },
  {
    key: "blocked",
    path: 0,
    owner: "artist_a0",
    title: "Draft — Unverified Artist",
    medium: "Gouache on paper",
    dimensions: "30 x 40 cm",
    year: 2026,
    category: "painting",
    pricePaise: rs(2_500),
    commerceStatus: "unlisted",
    lifecycleStatus: "draft",
    coa: null,
    mint: null,
    bind: null,
    curatorPick: false,
    note: "Eligibility matrix row 1: unverified artist. Primary listing BLOCKED by the real engine, not by a flag.",
  },
];

const SAMPLE_IMAGE = "https://res.cloudinary.com/demo/image/upload/w_1200/sample.jpg";

async function seedArtworks(users) {
  const byKey = Object.fromEntries(users.map((u) => [u.key, u]));
  const curatorRow = id("cur", "curator");

  for (const art of ARTWORKS) {
    const artworkId = id("art", art.key);
    const ownerId = byKey[art.owner].userId;

    await sql`
      insert into artworks (
        id, "userId", title, year, medium, description, dimensions, status,
        lifecycle_status, commerce_status, exhibition_status, custody_status,
        "imageUrl", "isPublic", category, price_paise, tags, "createdAt", "updatedAt"
      ) values (
        ${artworkId}, ${ownerId}, ${art.title}, ${art.year}, ${art.medium},
        ${art.note}, ${art.dimensions},
        ${art.commerceStatus === "sold" ? "sold" : "available"},
        ${art.lifecycleStatus}, ${art.commerceStatus},
        ${art.exhibitionStatus ?? "not_exhibited"},
        ${art.commerceStatus === "sold" ? "at_venue" : "with_artist"},
        ${SAMPLE_IMAGE}, true, ${art.category}, ${art.pricePaise},
        ${["seed", `path-${art.path}`]}, now(), now()
      )
      on conflict (id) do update set
        title = excluded.title, price_paise = excluded.price_paise,
        lifecycle_status = excluded.lifecycle_status,
        commerce_status = excluded.commerce_status,
        exhibition_status = excluded.exhibition_status,
        description = excluded.description, "updatedAt" = now()
    `;

    // A unique edition per work, so the COA has something to certify.
    await sql`
      insert into editions (id, artwork_id, user_id, edition_type, status, created_at, updated_at)
      values (${id("ed", art.key)}, ${artworkId}, ${ownerId}, 'unique', 'active', now(), now())
      on conflict (id) do update set status = excluded.status, updated_at = now()
    `;

    if (art.coa) {
      await sql`
        insert into coa_certificates (
          id, artwork_id, edition_id, user_id, metadata_hash, version, status,
          coa_level, issued_at, created_at, "creatorName", "objectType", privacy
        ) values (
          ${id("coa", art.key)}, ${artworkId}, ${id("ed", art.key)}, ${ownerId},
          ${"0x" + randomBytes(32).toString("hex")}, 1, ${art.coa.status},
          ${art.coa.level}, now(), now(), ${byKey[art.owner].name}, 'artwork', 'public'
        )
        on conflict (id) do update set
          status = excluded.status, coa_level = excluded.coa_level
      `;
    }

    if (art.mint) {
      // A confirmed Merkle root is what makes the commitment P3 (anchored):
      // the commitment is 'minted' only because its root is on-chain.
      const rootId = id("root", art.key);
      await sql`
        insert into merkle_roots (
          id, root_hash, tx_hash, chain_id, block_number, leaf_count, status, created_at
        ) values (
          ${rootId}, ${"0x" + randomBytes(32).toString("hex")},
          ${"0x" + randomBytes(32).toString("hex")}, 84532, 9000000, 1, 'confirmed', now()
        )
        on conflict (id) do update set status = excluded.status
      `;
      await sql`
        insert into mint_commitments (
          id, artwork_id, edition_id, user_id, leaf_hash, wallet_address,
          erc2981_royalty_bps, status, merkle_root_id, token_id, mint_tx_hash, created_at
        ) values (
          ${id("mc", art.key)}, ${artworkId}, ${id("ed", art.key)}, ${ownerId},
          ${"0x" + randomBytes(32).toString("hex")},
          ${"0x" + randomBytes(20).toString("hex")},
          400, ${art.mint.status}, ${rootId},
          ${String(1000 + art.path)}, ${"0x" + randomBytes(32).toString("hex")}, now()
        )
        on conflict (id) do update set
          status = excluded.status, merkle_root_id = excluded.merkle_root_id
      `;
    }

    if (art.bind) {
      const tagId = id("tag", art.key);
      await sql`
        insert into art_tags (
          id, artwork_id, tag_type, tag_uid, bound_by, bound_at, scan_count,
          key_reference, sun_counter_last_seen, binding_status, created_at
        ) values (
          ${tagId}, ${artworkId}, ${art.bind.tagType},
          ${`SEED-${art.bind.tagType.toUpperCase()}-${art.key.toUpperCase()}`},
          ${ownerId}, now(), ${art.bind.scanned ? 3 : 0},
          ${art.bind.tagType === "nfc" ? `kms://seed/${art.key}` : null},
          ${art.bind.tagType === "nfc" ? 3 : null},
          'bound', now()
        )
        on conflict (id) do update set
          binding_status = 'bound', bound_at = now(), artwork_id = excluded.artwork_id
      `;
      if (art.bind.scanned) {
        // A scan row only ever exists after signature/SUN verification
        // succeeded, so its presence IS the crypto verification -> B3.
        await sql`
          insert into art_tag_scans (id, tag_id, scanned_at, ip_address, user_agent, location)
          values (
            ${id("scan", art.key)}, ${tagId}, now(), '203.0.113.7', 'seed-demo',
            ${JSON.stringify({ city: "Jaipur" })}
          )
          on conflict (id) do nothing
        `;
      }
    }

    if (art.curatorPick) {
      await sql`
        insert into curator_picks (id, curator_id, artwork_id, note, created_at)
        values (
          ${id("pick", art.key)}, ${curatorRow}, ${artworkId},
          'Seeded curator pick: supplies the curation sign-off canList() requires.', now()
        )
        on conflict (id) do update set note = excluded.note
      `;
    }

    // Provenance: append-only (Invariant 7, Rule 43). Written in event order,
    // never updated — a re-run inserts nothing new rather than rewriting.
    const chain = [["created", "Registered by the artist"]];
    if (art.coa) chain.push(["certified", `COA level ${art.coa.level} issued`]);
    if (art.mint) chain.push(["minted", "Commitment anchored on Base Sepolia"]);
    if (art.bind) chain.push(["bound", `${art.bind.tagType.toUpperCase()} tag bound`]);
    if (art.exhibit) chain.push(["exhibited", "Placed on a wall slot via an exhibition record"]);
    if (art.commerceStatus === "sold") chain.push(["sold", "Primary sale completed"]);

    for (const [index, [eventType, label]] of chain.entries()) {
      await sql`
        insert into provenance_events (
          id, artwork_id, event_type, actor_id, label, metadata, occurred_at, created_at
        ) values (
          ${id("prov", art.key, String(index))}, ${artworkId}, ${eventType}, ${ownerId}, ${label},
          ${JSON.stringify({ seeded: true, sequence: index })},
          now() - (${String(chain.length - index)} || ' days')::interval, now()
        )
        on conflict (id) do nothing
      `;
    }
  }
}

/* ── Demand signals ───────────────────────────────────────────────────────────
 * Real rows in the real tables, so Trending / Today's Pick / Recently
 * favorited render from the demand engine instead of a fallback. Section 44:
 * the numeric score is INTERNAL — no UI is added here, and nothing public
 * should ever print these numbers, only qualitative bands. */
const DEMAND_MIX = {
  high: [
    ["view", 1, 180],
    ["wishlist", 5, 24],
    ["share", 4, 11],
    ["inquiry", 8, 6],
    ["scan", 6, 31],
  ],
  medium: [
    ["view", 1, 70],
    ["wishlist", 5, 8],
    ["share", 4, 3],
    ["inquiry", 8, 1],
  ],
  low: [
    ["view", 1, 12],
    ["wishlist", 5, 1],
  ],
};

/** Every listed work gets a mix, so the homepage rails have several candidates. */
const DEMAND_LEVELS = {
  path1: "medium",
  path2: "high",
  path3: "medium",
  path4: "high",
  path5: "high",
  path6: "low",
};

async function seedDemand() {
  for (const [key, level] of Object.entries(DEMAND_LEVELS)) {
    const artworkId = id("art", key);

    // demand_signals is append-only at the DB level (a trigger refuses UPDATE
    // and DELETE), so a re-run must not clear and rewrite the log, or it would
    // both fail and double the score. Write the signal set once; the aggregate
    // below is a normal upsert and stays correct either way.
    const [{ count }] = await sql`
      select count(*)::int as count from demand_signals where artwork_id = ${artworkId}
    `;

    let score = 0;
    const rows = [];
    for (const [signalType, weight, count] of DEMAND_MIX[level]) {
      for (let n = 0; n < count; n += 1) {
        rows.push([artworkId, signalType, weight, n % 14]);
      }
      score += weight * count;
    }

    if (count === 0) {
      // One multi-row insert rather than ~250 round trips.
      const values = rows
        .map(
          (_, i) =>
            `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, 1, now() - ($${i * 4 + 4} || ' days')::interval)`
        )
        .join(", ");
      await pool.query(
        `insert into demand_signals (artwork_id, signal_type, weight, value, recorded_at) values ${values}`,
        rows.flatMap((r) => [r[0], r[1], r[2], String(r[3])])
      );
    }

    await sql`
      insert into demand_aggregates (artwork_id, score, threshold_crossed_at, computed_at)
      values (${artworkId}, ${score}, ${level === "high" ? new Date() : null}, now())
      on conflict (artwork_id) do update set
        score = excluded.score,
        threshold_crossed_at = excluded.threshold_crossed_at,
        computed_at = now()
    `;
  }
}

/* ── WallOS hierarchy ─────────────────────────────────────────────────────────
 * Rule 31: Organization -> Venue -> Building -> Floor -> Room/Zone -> Wall ->
 * Slot. Rule 21: a slot may exist with no artwork. Rule 22 / Invariant 12: the
 * slot's QR identifies the SLOT, permanently — never the artwork. */
const SLOTS = [
  { key: "a1", label: "A1", note: "holds the exhibited-and-sold work (path 5)" },
  { key: "a2", label: "A2", note: "held the rotated-and-returned work (path 6), now free" },
  { key: "a3", label: "A3", note: "EMPTY, with an active slot-bound QR (Rule 21 + Invariant 12)" },
];

async function seedWallOS() {
  await sql`
    insert into organizations (id, name, created_at, updated_at)
    values (${id("org", "artwall")}, 'Jaipur Hospitality Collective (seed)', now(), now())
    on conflict (id) do update set name = excluded.name, updated_at = now()
  `;
  await sql`
    insert into venues (id, organization_id, name, created_at, updated_at)
    values (${id("venue", "amber")}, ${id("org", "artwall")}, 'Amber Cafe and Roastery (seed)', now(), now())
    on conflict (id) do update set name = excluded.name, updated_at = now()
  `;
  await sql`
    insert into buildings (id, venue_id, name, created_at, updated_at)
    values (${id("bld", "main")}, ${id("venue", "amber")}, 'Main Building', now(), now())
    on conflict (id) do update set name = excluded.name, updated_at = now()
  `;
  await sql`
    insert into floors (id, building_id, name, level, created_at, updated_at)
    values (${id("flr", "g")}, ${id("bld", "main")}, 'Ground Floor', 0, now(), now())
    on conflict (id) do update set name = excluded.name, updated_at = now()
  `;
  await sql`
    insert into rooms_zones (id, floor_id, name, created_at, updated_at)
    values (${id("rz", "cafe")}, ${id("flr", "g")}, 'Cafe Seating Zone', now(), now())
    on conflict (id) do update set name = excluded.name, updated_at = now()
  `;
  await sql`
    insert into walls (id, room_zone_id, name, created_at, updated_at)
    values (${id("wall", "north")}, ${id("rz", "cafe")}, 'North Wall', now(), now())
    on conflict (id) do update set name = excluded.name, updated_at = now()
  `;

  for (const slot of SLOTS) {
    await sql`
      insert into slots (id, wall_id, label, created_at, updated_at)
      values (${id("slot", slot.key)}, ${id("wall", "north")}, ${slot.label}, now(), now())
      on conflict (id) do update set label = excluded.label, updated_at = now()
    `;
  }
}

/**
 * Slot-bound QR tokens. One per slot, including the empty one — the QR belongs
 * to the slot and survives every artwork rotation (Rule 22, Invariant 12).
 *
 * Requires pw_qr_tokens.subject_type to accept 'slot'. If this database has
 * not had that migration applied, the slot QRs are skipped with a warning
 * rather than failing the whole seed: the constraint is the application's, and
 * it is not this script's business to bypass it. See docs/runbooks/SEED-DATA.md.
 */
async function seedSlotQrTokens() {
  let written = 0;
  for (const slot of SLOTS) {
    try {
      await sql`
        insert into pw_qr_tokens (token, subject_type, subject_id, issued_at, expires_at, revoked_at)
        values (${id("qr", "slot", slot.key)}, 'slot', ${id("slot", slot.key)}, now(), null, null)
        on conflict (token) do update set revoked_at = null, expires_at = null
      `;
      written += 1;
    } catch (error) {
      if (error.code === "23514") {
        console.warn(
          "  ! pw_qr_tokens rejects subject_type='slot' on this database.\n" +
            "    Apply the migration widening pw_qr_tokens_subject_check, then re-run.\n" +
            "    Slot QRs skipped; nothing else is affected."
        );
        return written;
      }
      throw error;
    }
  }
  return written;
}

/* ── Exhibitions ──────────────────────────────────────────────────────────────
 * Rules 17-18: an exhibition exists ONLY for an artwork with an active
 * physical binding AND anchored blockchain provenance. Both exhibited works
 * below are B3 + P3, so each genuinely passes canExhibit() — this seed does
 * not create an exhibition the engine would refuse.
 *
 * Invariant 1 (one active exhibition per slot) holds by construction: slot A1
 * carries the only 'published' exhibition, slot A2's has reached 'ended', and
 * A3 is empty. */
const EXHIBITIONS = [
  {
    key: "amber_current",
    owner: "artist_a4",
    artwork: "path5",
    slot: "a1",
    title: "Current Hang — North Wall A1",
    status: "published",
    start: "2026-09-01",
    end: "2026-12-31",
    transitions: [
      [null, "draft"],
      ["draft", "published"],
    ],
  },
  {
    key: "amber_rotated",
    owner: "artist_a2",
    artwork: "path6",
    slot: "a2",
    title: "Spring Rotation — North Wall A2",
    // The rotated-and-returned end state. The lifecycle's real terminal is
    // 'ended' (features/exhibitions/lifecycle.ts): draft -> published ->
    // ending -> ended. Not 'past', which an earlier schema allowed and a
    // later migration removed.
    status: "ended",
    start: "2026-03-01",
    end: "2026-05-31",
    transitions: [
      [null, "draft"],
      ["draft", "published"],
      ["published", "ending"],
      ["ending", "ended"],
    ],
  },
];

async function seedExhibitions(users) {
  const byKey = Object.fromEntries(users.map((u) => [u.key, u]));
  for (const ex of EXHIBITIONS) {
    const ownerId = byKey[ex.owner].userId;
    await sql`
      insert into exhibitions (
        id, user_id, title, description, venue, start_date, end_date, status, created_at, updated_at
      ) values (
        ${id("exh", ex.key)}, ${ownerId}, ${ex.title},
        ${`Seeded exhibition on slot ${ex.slot.toUpperCase()}. The artwork is B3 + P3, so it passes canExhibit (Rules 17-18).`},
        'Amber Cafe and Roastery (seed)', ${ex.start}, ${ex.end}, ${ex.status}, now(), now()
      )
      on conflict (id) do update set status = excluded.status, updated_at = now()
    `;
    await sql`
      insert into exhibition_artworks (exhibition_id, artwork_id, display_order)
      values (${id("exh", ex.key)}, ${id("art", ex.artwork)}, 0)
      on conflict (exhibition_id, artwork_id) do nothing
    `;
    // exhibition_transitions is append-only at the DB level: a trigger refuses
    // UPDATE and DELETE (Invariant 7 / Rule 43). So a re-run must not rewrite
    // the log — it writes the chain once and then leaves it alone.
    const [{ count }] = await sql`
      select count(*)::int as count from exhibition_transitions
      where exhibition_id = ${id("exh", ex.key)}
    `;
    if (count === 0) {
      for (const [from, to] of ex.transitions) {
        await sql`
          insert into exhibition_transitions (
            exhibition_id, from_status, to_status, actor_id, note, transitioned_at
          ) values (
            ${id("exh", ex.key)}, ${from}, ${to}, ${ownerId}, 'seeded lifecycle move', now()
          )
        `;
      }
    }
  }
}

/* ── Orders: both escrow and direct paths (section A1) ────────────────────────
 * Section A1: escrow is pre-selected when buyer.order_count == 0 OR price >
 * Rs 10,000, otherwise direct. The schema has no escrow_mode column — the
 * presence of an escrow_holds row for the sub-order IS the escrow path
 * (migration 0067 attaches a hold to exactly one seller_order). So:
 *   - the first-time buyer's order carries an escrow hold  -> escrow path
 *   - the repeat buyer's completed order carries none      -> direct path
 *
 * Section A13 privacy masking: buyer name, price and wallet live here as
 * ordinary order data, shown only to the parties the masking rules allow.
 * Nothing in this seed publishes them. */
const ORDERS = [
  {
    key: "escrow",
    buyer: "buyer_first",
    seller: "artist_a4",
    artwork: "path5",
    amount: rs(3_20_000),
    escrow: true,
    orderStatus: "paid",
    sellerStatus: "shipped",
    events: [
      [null, "pending_payment"],
      ["pending_payment", "paid"],
      ["paid", "processing"],
      ["processing", "shipped"],
    ],
    note: "Escrow path (A1): first-time buyer, order_count was 0, and price > Rs 10,000. Funds held, 72h inspection pending.",
  },
  {
    key: "direct",
    buyer: "buyer_repeat",
    seller: "artist_a2",
    artwork: "path2",
    amount: rs(42_500),
    escrow: false,
    orderStatus: "paid",
    sellerStatus: "completed",
    events: [
      [null, "pending_payment"],
      ["pending_payment", "paid"],
      ["paid", "processing"],
      ["processing", "shipped"],
      ["shipped", "delivered"],
      ["delivered", "completed"],
    ],
    note: "Direct path (A1): repeat buyer, settled, no inspection hold.",
  },
  {
    key: "pending",
    buyer: "buyer_first",
    seller: "artist_a1",
    artwork: "path1",
    amount: rs(18_000),
    escrow: true,
    orderStatus: "pending_payment",
    sellerStatus: "pending_payment",
    events: [[null, "pending_payment"]],
    note: "Unpaid checkout still holding its artwork — exercises the expiry sweeper.",
  },
];

async function seedOrders(users) {
  const byKey = Object.fromEntries(users.map((u) => [u.key, u]));
  const [policy] = await sql`
    select id from commission_policy_versions
    where effective_to is null order by version desc limit 1
  `;
  if (!policy) {
    throw new Error("No open commission_policy_versions row — migration 0044 must be applied.");
  }

  const address = {
    line1: "14 Civil Lines",
    city: "Jaipur",
    state: "Rajasthan",
    pincode: "302006",
    country: "IN",
  };

  for (const [index, ord] of ORDERS.entries()) {
    const orderId = id("ord", ord.key);
    const sellerOrderId = id("sord", ord.key);
    const buyer = byKey[ord.buyer];
    const seller = byKey[ord.seller];
    const shipping = rs(250);
    const gst = Math.round(ord.amount * 0.05); // 5% GST on fine art (section 13)
    const total = ord.amount + shipping + gst;

    // Split snapshot: platform 10% of the item subtotal (section A15, primary
    // sale with no gallery and no exhibition), curator 0, seller the rest.
    const platformFee = Math.round(ord.amount * 0.1);
    const sellerNet = ord.amount - platformFee;
    const paid = ord.orderStatus === "paid";
    const shipped = ["shipped", "delivered", "completed"].includes(ord.sellerStatus);
    const delivered = ["delivered", "completed"].includes(ord.sellerStatus);

    await sql`
      insert into orders (
        id, order_number, buyer_id, buyer_email, buyer_phone, status,
        subtotal_paise, shipping_paise, gst_paise, total_paise, currency,
        shipping_address, expires_at, paid_at, created_at, updated_at
      ) values (
        ${orderId}, ${`SEED-${String(1001 + index)}`}, ${buyer.userId}, ${buyer.email},
        '+919000000000', ${ord.orderStatus},
        ${ord.amount}, ${shipping}, ${gst}, ${total}, 'INR',
        ${JSON.stringify(address)},
        now() + interval '30 minutes',
        ${paid ? new Date() : null}, now(), now()
      )
      on conflict (id) do update set status = excluded.status, updated_at = now()
    `;

    await sql`
      insert into seller_orders (
        id, order_id, seller_id, status, subtotal_paise, shipping_paise, total_paise,
        platform_fee_paise, curator_fee_paise, seller_net_paise,
        commission_policy_version_id, accept_by, release_eligible_at,
        paid_at, accepted_at, shipped_at, delivered_at, completed_at, created_at, updated_at
      ) values (
        ${sellerOrderId}, ${orderId}, ${seller.userId}, ${ord.sellerStatus},
        ${ord.amount}, ${shipping}, ${ord.amount + shipping},
        ${platformFee}, 0, ${sellerNet}, ${policy.id},
        now() + interval '48 hours',
        ${ord.escrow && paid ? new Date(Date.now() + 3 * 86400000) : null},
        ${paid ? new Date() : null},
        ${["processing", "shipped", "delivered", "completed"].includes(ord.sellerStatus) ? new Date() : null},
        ${shipped ? new Date() : null},
        ${delivered ? new Date() : null},
        ${ord.sellerStatus === "completed" ? new Date() : null},
        now(), now()
      )
      on conflict (id) do update set status = excluded.status, updated_at = now()
    `;

    await sql`
      insert into order_items (
        id, order_id, seller_order_id, artwork_id, seller_id, title_snapshot,
        image_snapshot, unit_price_paise, quantity, platform_fee_paise,
        curator_fee_paise, seller_net_paise, active, created_at
      ) values (
        ${id("oi", ord.key)}, ${orderId}, ${sellerOrderId}, ${id("art", ord.artwork)},
        ${seller.userId}, ${ARTWORKS.find((a) => a.key === ord.artwork).title},
        ${SAMPLE_IMAGE}, ${ord.amount}, 1, ${platformFee}, 0, ${sellerNet}, true, now()
      )
      on conflict (id) do update set unit_price_paise = excluded.unit_price_paise
    `;

    if (paid) {
      await sql`
        insert into order_payments (
          id, order_id, provider, provider_order_id, provider_payment_id, event_id,
          amount_paise, status, captured_at, created_at
        ) values (
          ${id("opay", ord.key)}, ${orderId}, 'razorpay',
          ${`order_seed_${ord.key}`}, ${`pay_seed_${ord.key}`}, ${`evt_seed_${ord.key}`},
          ${total}, 'captured', now(), now()
        )
        on conflict (id) do update set status = excluded.status
      `;
    }

    // Escrow path only: a hold on this sub-order. Its absence is the direct path.
    if (ord.escrow && paid) {
      await sql`
        insert into escrow_holds (
          id, booking_id, seller_order_id, amount_paise, reason, status,
          dispute_window_days, release_eligible_at, commission_policy_version_id, created_at
        ) values (
          ${id("esc", ord.key)}, null, ${sellerOrderId}, ${ord.amount + shipping},
          ${ord.note}, 'held', 3, now() + interval '3 days', ${policy.id}, now()
        )
        on conflict (id) do update set status = excluded.status
      `;
    }

    // Money owed once escrow releases / once a direct order completes.
    if (ord.sellerStatus === "completed" || ord.sellerStatus === "shipped") {
      await sql`
        insert into payouts (
          id, seller_order_id, payee_user_id, payee_kind, amount_paise, status, created_at, updated_at
        ) values (
          ${id("pay", ord.key)}, ${sellerOrderId}, ${seller.userId}, 'artist',
          ${sellerNet}, ${ord.sellerStatus === "completed" ? "paid" : "owed"}, now(), now()
        )
        on conflict (id) do update set status = excluded.status, updated_at = now()
      `;
    }

    await sql`delete from order_events where order_id = ${orderId}`;
    for (const [from, to] of ord.events) {
      await sql`
        insert into order_events (
          order_id, seller_order_id, from_status, to_status, actor_id, note, at
        ) values (
          ${orderId}, ${sellerOrderId}, ${from}, ${to}, ${buyer.userId}, 'seeded lifecycle move', now()
        )
      `;
    }
  }
}

/* ── Credentials file ─────────────────────────────────────────────────────── */

async function writeCredentials(credentials, targetHost) {
  const rows = credentials.map((c) => {
    const roleLabel = c.adminRole
      ? `admin (${c.adminRole})`
      : c.wallos
        ? `${c.role} — ${c.wallos}`
        : c.role;
    const persona = c.persona ?? (c.adminRole ? "platform admin" : "—");
    return `| ${roleLabel} | ${persona} | \`${c.email}\` | \`${c.password}\` | ${c.purpose} | ${c.screens} |`;
  });

  const blocked = ARTWORKS.find((a) => a.path === 0);
  const body = `# ArtWall — seed account credentials

**DO NOT COMMIT.** This file is gitignored (\`SEED-CREDENTIALS*.md\`). It holds
plaintext passwords for demo accounts only.

- Generated: ${new Date().toISOString()}
- Target database host: \`${targetHost}\`
- Every account has its own random password. There is no shared password.
- Sign in at \`/sign-in\`. Admin accounts land on \`/physical-wall/admin\`.
- Re-running the seed script rotates every password and rewrites this file.
- Remove every seeded account and row with:
  \`SEED_DATABASE_URL='...' node apps/web/scripts/seed-demo.mjs --purge\`

> These are ordinary accounts. No application code special-cases them — they
> flow through the same policy engine, eligibility matrix and invariants as
> real users. The only marker is a \`seed_\` id prefix, used for purging.

| Role | Persona | Email | Password | What it is for | Screens it proves out |
|---|---|---|---|---|---|
${rows.join("\n")}

## Artwork paths seeded (section 21, sections 159-164)

${ARTWORKS.filter((a) => a.path > 0)
  .map((a) => `- **Path ${a.path}** — "${a.title}" (${a.owner}): ${a.note}`)
  .join("\n")}
- **Blocked control** — "${blocked.title}" (${blocked.owner}): ${blocked.note}

## Notes

- Prices are integer paise, INR, inside the section A4 range (Rs 500 – Rs 50,00,000).
- Demand scores exist in \`demand_aggregates\` but are **internal** (section 44).
  Never surface the number publicly — qualitative bands only.
- Slot QR tokens are slot-bound, never artwork-bound (Rule 22, Invariant 12).
- Slot A3 is deliberately EMPTY and still carries an active QR (Rule 21).
`;

  // apps/web/scripts -> repo root
  const path = join(import.meta.dirname, "..", "..", "..", "SEED-CREDENTIALS.md");
  await writeFile(path, body, "utf8");
  return path;
}

/* ── Main ─────────────────────────────────────────────────────────────────── */

try {
  if (PURGE) {
    console.log("\nPurging seeded rows...\n");
    await purge();
  } else {
    console.log("\nSeeding demo data...\n");
    const users = await seedAccounts();
    console.log(`  accounts            ${users.length}`);
    await seedWallOS();
    console.log(
      `  WallOS hierarchy    org > venue > building > floor > room > wall > ${SLOTS.length} slots`
    );
    const qrCount = await seedSlotQrTokens();
    console.log(`  slot-bound QRs      ${qrCount} (one on an EMPTY slot — Rule 21)`);
    await seedArtworks(users);
    console.log(`  artworks            ${ARTWORKS.length} (6 valid paths + 1 blocked control)`);
    await seedExhibitions(users);
    console.log(`  exhibitions         ${EXHIBITIONS.length} (1 active on A1, 1 past on A2 — Invariant 1 holds)`);
    await seedDemand();
    console.log(`  demand signals      ${Object.keys(DEMAND_LEVELS).length} artworks scored`);
    await seedOrders(users);
    console.log(`  orders              ${ORDERS.length} (1 escrow held, 1 direct completed, 1 unpaid)`);

    const path = await writeCredentials(users, host);
    console.log(`\nCredentials written to ${path} (gitignored — not printed here).`);
    console.log("Purge with:  node apps/web/scripts/seed-demo.mjs --purge\n");
  }
} catch (error) {
  console.error("\nFAILED:", error.message ?? error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
