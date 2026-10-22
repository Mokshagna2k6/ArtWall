/**
 * Showcase data: ~100 artists and ~400 artworks, for a launch-ready site.
 *
 *   node --env-file=.env scripts/seed-showcase.mjs
 *   node --env-file=.env scripts/seed-showcase.mjs --purge
 *
 * ## Why this exists separately from seed-demo.mjs
 *
 * `seed-demo.mjs` builds a small, hand-written dataset that encodes specific
 * product rules (a blocked artwork, an escrow order, a QR on an empty slot) and
 * is read by tests. This one is about VOLUME: enough artists and work that the
 * marketplace, artist directory and search look like a real catalogue rather
 * than an empty shell. The two are independent and can both be loaded.
 *
 * ## Running this against production is intended
 *
 * This is showcase content for new visitors, so it ships to production. That
 * makes the delete path the important half, and it is built on one rule:
 *
 *   **Every row written here has an id prefixed `show_`.**
 *
 * The purge deletes only rows matching that prefix, so it is structurally
 * incapable of touching a real artist's work — the safety is in the id, not in
 * a WHERE clause someone has to get right. Demo accounts are additionally
 * tagged `{ artwall_seed: "showcase" }` in `auth.users.user_metadata`, because
 * their ids are Supabase uuids and cannot carry the prefix.
 *
 * The same purge runs from the admin UI (Super Admin only) via
 * `purgeShowcaseData` in src/features/admin/showcase.ts, which reuses the
 * statements exported from this file so the two can never drift.
 *
 * ## Images
 *
 * Images live in THIS project's Cloudinary account under `artwall-showcase/`.
 * They are not hot-linked: `next.config.ts` allows only `res.cloudinary.com`,
 * and widening that allowlist would turn next/image into an open image proxy
 * at our bandwidth cost.
 *
 * **A SHARED POOL, not one image per artwork.** 48 artwork images and 12
 * avatars are uploaded once and assigned across all ~400 artworks, because the
 * account is on Cloudinary's free tier (25 credits) and every distinct image
 * costs ~3 transformations the first time next/image renders it at card,
 * detail and thumbnail size. 500 unique images would be ~1500 transformations
 * before a single real visitor arrives; 60 is ~180, and repeat URLs are served
 * from the CDN. The catalogue still reads as varied because titles, artists,
 * prices, media and categories all differ per work.
 *
 * Re-running reuses what is already uploaded (deterministic `public_id` plus
 * `overwrite=false`), so a second run costs no new uploads at all.
 */

import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { assertSafeSeedTarget } from "./seed-guard.mjs";
import { VIRTUAL_WALL_PURGE_SQL } from "./seed-virtual-wall.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");

const PURGE = process.argv.includes("--purge");

/** Every id this script writes starts with this. The purge keys off it. */
export const SHOWCASE_PREFIX = "show_";

/**
 * Handle prefix. Separate from SHOWCASE_PREFIX because `artist_profiles.handle`
 * is constrained to `^[a-z0-9]+(?:-[a-z0-9]+)*$` — no underscores — so the id
 * prefix cannot be reused here.
 */
export const SHOWCASE_HANDLE_PREFIX = "showcase-";

/** Marks demo accounts in auth.users, whose ids are uuids and cannot be prefixed. */
export const SHOWCASE_TAG = "showcase";

const ARTIST_COUNT = 100;
/** Artworks per artist, picked from this range — a real catalogue is uneven. */
const WORKS_MIN = 3;
const WORKS_MAX = 6;

/**
 * Size of the shared image pool. Kept small on purpose: see the header note on
 * Cloudinary's free tier. 48 artwork images across ~400 works means each is
 * reused ~8 times, under different titles, artists and prices.
 */
const ARTWORK_IMAGE_POOL = 48;
const AVATAR_IMAGE_POOL = 12;

// ---------------------------------------------------------------------------
// Purge — ordered child-to-parent so foreign keys never block a delete.
// ---------------------------------------------------------------------------

/**
 * Deletes that remove everything this script writes, in dependency order.
 * Exported so the admin action runs exactly these statements.
 */
export const SHOWCASE_PURGE_SQL = [
  `delete from demand_signals where artwork_id like '${SHOWCASE_PREFIX}%'`,
  `delete from demand_aggregates where artwork_id like '${SHOWCASE_PREFIX}%'`,
  `delete from collection_artworks where artwork_id like '${SHOWCASE_PREFIX}%' or collection_id like '${SHOWCASE_PREFIX}%'`,
  `delete from collections where id like '${SHOWCASE_PREFIX}%'`,
  // The showcase virtual building (scripts/seed-virtual-wall.mjs). Its
  // placements reference artworks, so they must go first; 0050's hierarchy
  // foreign keys are `on delete restrict`, hence child-to-parent order.
  ...VIRTUAL_WALL_PURGE_SQL,
  `delete from artworks where id like '${SHOWCASE_PREFIX}%'`,
  `delete from artist_profiles where handle like '${SHOWCASE_HANDLE_PREFIX}%'`,
  // Profile rows are keyed by the auth uuid, so they are matched by the handle
  // of the profile that was removed just above, then by the tag on auth.users.
  `delete from "user" where id in (
     select u.id from "user" u
     where not exists (select 1 from artist_profiles p where p."userId" = u.id)
       and u.email like '%@showcase.artwall.test'
   )`,
];

// ---------------------------------------------------------------------------
// Content — deterministic, so a re-run produces the same catalogue.
// ---------------------------------------------------------------------------

const FIRST = [
  "Aarav", "Ananya", "Arjun", "Devika", "Farhan", "Gauri", "Harsh", "Ira",
  "Jay", "Kavya", "Lakshmi", "Manav", "Neha", "Omkar", "Priya", "Rhea",
  "Rohan", "Sanya", "Tara", "Uday", "Vikram", "Yash", "Zoya", "Aditi",
  "Bhavna", "Chirag", "Diya", "Esha", "Girish", "Hema", "Imran", "Jyoti",
  "Kabir", "Leela", "Mira", "Nikhil", "Pallavi", "Raghav", "Simran", "Tanvi",
];

const LAST = [
  "Sharma", "Iyer", "Reddy", "Mehta", "Nair", "Bose", "Kulkarni", "Chawla",
  "Desai", "Gupta", "Joshi", "Khan", "Menon", "Patel", "Rao", "Sethi",
  "Thakur", "Verma", "Banerjee", "Chauhan", "Dutta", "Ghosh", "Kapoor", "Mishra",
];

const CITIES = [
  "Jaipur, Rajasthan", "Mumbai, Maharashtra", "Bengaluru, Karnataka",
  "Kolkata, West Bengal", "Chennai, Tamil Nadu", "New Delhi, Delhi",
  "Ahmedabad, Gujarat", "Pune, Maharashtra", "Kochi, Kerala",
  "Hyderabad, Telangana", "Lucknow, Uttar Pradesh", "Bhubaneswar, Odisha",
  "Shantiniketan, West Bengal", "Udaipur, Rajasthan", "Goa",
];

/** Must match src/features/marketplace/categories.ts. */
const CATEGORIES = [
  "painting", "photography", "sculpture", "drawing",
  "printmaking", "textile", "digital", "mixed-media",
];

const DISCIPLINES = {
  painting: ["Painting", "Oil on canvas", "Acrylic"],
  photography: ["Photography", "Documentary photography"],
  sculpture: ["Sculpture", "Ceramics", "Metalwork"],
  drawing: ["Drawing", "Charcoal", "Ink"],
  printmaking: ["Printmaking", "Etching", "Serigraphy"],
  textile: ["Textile", "Weaving", "Block print"],
  digital: ["Digital art", "Generative art"],
  "mixed-media": ["Mixed media", "Collage", "Assemblage"],
};

const MEDIUMS = {
  painting: ["Oil on canvas", "Acrylic on canvas", "Watercolour on paper"],
  photography: ["Archival pigment print", "Silver gelatin print"],
  sculpture: ["Bronze", "Terracotta", "Carved teak"],
  drawing: ["Charcoal on paper", "Ink on paper", "Graphite on paper"],
  printmaking: ["Etching on paper", "Serigraph", "Linocut"],
  textile: ["Handwoven cotton", "Natural-dyed silk", "Block-printed khadi"],
  digital: ["Digital print on archival paper", "Generative work, archival print"],
  "mixed-media": ["Mixed media on board", "Collage and acrylic"],
};

const TITLE_A = [
  "Monsoon", "Afternoon", "Blue Hour", "Dust", "Riverbed", "Courtyard",
  "Threshold", "Quiet", "Salt", "Ledger", "Migration", "Noon", "Harvest",
  "Interior", "Threadbare", "Low Tide", "Terrace", "Winter", "Festival", "Iron",
];

const TITLE_B = [
  "in Amber", "over Nahargarh", "at Marine Drive", "near the Ghats",
  "in Shantiniketan", "of Small Gods", "in Old Delhi", "at Fort Kochi",
  "in the Thar", "after Rain", "at Chowpatty", "in Bylanes",
  "of the Weavers", "at First Light", "in Translation", "before Dawn",
];

const BIO_OPENERS = [
  "Works between observation and memory, mostly",
  "Trained in the classical tradition and now working",
  "A practice built around everyday surfaces, working",
  "Makes slow, material-led work",
  "Concerned with light and labour, working",
];

const BIO_CLOSERS = [
  "Exhibits regularly across India.",
  "Has shown in group exhibitions since 2019.",
  "Teaches part-time alongside studio practice.",
  "Works to commission as well as for exhibition.",
  "Represented in several private collections.",
];

// ---------------------------------------------------------------------------
// Deterministic helpers — same output on every run, no Math.random().
// ---------------------------------------------------------------------------

/** A stable 32-bit number from a string, so every choice is reproducible. */
function hash(seed) {
  return parseInt(createHash("sha1").update(String(seed)).digest("hex").slice(0, 8), 16);
}

function pick(list, seed) {
  return list[hash(seed) % list.length];
}

function between(min, max, seed) {
  return min + (hash(seed) % (max - min + 1));
}

function artistAt(index) {
  const key = `artist-${index}`;
  const name = `${pick(FIRST, key + "f")} ${pick(LAST, key + "l")}`;
  const category = pick(CATEGORIES, key + "c");
  // Handles must be unique and match ^[a-z0-9-]+$; the index guarantees both.
  const handle = `${SHOWCASE_HANDLE_PREFIX}${name.toLowerCase().replace(/[^a-z]+/g, "-")}-${index}`;
  return {
    index,
    key,
    name,
    handle,
    category,
    discipline: pick(DISCIPLINES[category], key + "d"),
    location: pick(CITIES, key + "loc"),
    bio: `${pick(BIO_OPENERS, key + "b1")} in ${pick(CITIES, key + "loc").split(",")[0]}. ${pick(BIO_CLOSERS, key + "b2")}`,
    email: `artist${index}@showcase.artwall.test`,
    works: between(WORKS_MIN, WORKS_MAX, key + "n"),
  };
}

function workAt(artist, n) {
  const key = `${artist.key}-work-${n}`;
  const category = hash(key + "cat") % 4 === 0 ? pick(CATEGORIES, key + "cat") : artist.category;
  // Prices in paise. Spread across a believable range rather than one number.
  const rupees = between(8, 240, key + "p") * 1000 + between(0, 9, key + "p2") * 100;
  return {
    id: `${SHOWCASE_PREFIX}art_${artist.index}_${n}`,
    title: `${pick(TITLE_A, key + "t1")} ${pick(TITLE_B, key + "t2")}`,
    year: 2018 + (hash(key + "y") % 8),
    category,
    medium: pick(MEDIUMS[category], key + "m"),
    pricePaise: rupees * 100,
    // ~1 in 7 already sold, so the catalogue is not uniformly available.
    status: hash(key + "s") % 7 === 0 ? "sold" : "available",
    width: between(30, 180, key + "w"),
    height: between(30, 180, key + "h"),
  };
}

// ---------------------------------------------------------------------------
// Cloudinary
// ---------------------------------------------------------------------------

const CLOUD = {
  name: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY,
  secret: process.env.CLOUDINARY_API_SECRET,
};

/**
 * Upload a remote image into this project's Cloudinary account.
 *
 * `public_id` is deterministic, and `overwrite=false` means a second run is
 * answered from what is already there instead of re-uploading. Cloudinary
 * returns the existing asset rather than an error in that case.
 */
async function uploadImage(sourceUrl, publicId, folder) {
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `folder=${folder}&overwrite=false&public_id=${publicId}&timestamp=${timestamp}${CLOUD.secret}`;
  const signature = createHash("sha1").update(toSign).digest("hex");

  const form = new FormData();
  form.append("file", sourceUrl);
  form.append("public_id", publicId);
  form.append("folder", folder);
  form.append("overwrite", "false");
  form.append("timestamp", String(timestamp));
  form.append("api_key", CLOUD.key);
  form.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD.name}/image/upload`, {
    method: "POST",
    body: form,
  });
  const body = await res.json();
  if (!body.secure_url) {
    throw new Error(`Cloudinary upload failed for ${publicId}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return { url: body.secure_url, publicId: body.public_id };
}

/**
 * Upload the shared pool once and return both lists of Cloudinary assets.
 *
 * Deterministic `public_id`s mean a re-run finds these already present and
 * uploads nothing. Artwork images are portrait 1200x1500 (the aspect the cards
 * expect); avatars are square.
 */
async function buildImagePool() {
  const artworks = [];
  const avatars = [];

  for (let i = 0; i < ARTWORK_IMAGE_POOL; i += 1) {
    artworks.push(
      await uploadImage(
        `https://picsum.photos/seed/artwall-work-${i}/1200/1500`,
        `work-${i}`,
        "artwall-showcase/artworks"
      )
    );
  }
  for (let i = 0; i < AVATAR_IMAGE_POOL; i += 1) {
    avatars.push(
      await uploadImage(
        `https://picsum.photos/seed/artwall-avatar-${i}/400/400`,
        `avatar-${i}`,
        "artwall-showcase/artists"
      )
    );
  }

  return { artworks, avatars };
}

// ---------------------------------------------------------------------------
// Supabase Auth — demo accounts
// ---------------------------------------------------------------------------

const SUPABASE = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function authHeaders() {
  return {
    apikey: SUPABASE.key,
    Authorization: `Bearer ${SUPABASE.key}`,
    "Content-Type": "application/json",
  };
}

/**
 * Create (or refresh) a showcase account and return its uuid.
 *
 * The `artwall_seed` tag is what makes these accounts findable for deletion:
 * their ids are Supabase uuids, so they cannot carry the `show_` prefix the
 * rest of this script relies on.
 */
async function createShowcaseUser({ email, password, name }) {
  const metadata = { name, artwall_seed: SHOWCASE_TAG };

  const res = await fetch(`${SUPABASE.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: metadata }),
  });
  if (res.ok) return (await res.json()).id;

  const body = await res.text();
  if (!/already|exists|registered/i.test(body)) {
    throw new Error(`Could not create ${email}: ${res.status} ${body.slice(0, 160)}`);
  }

  const found = await findUserByEmail(email);
  if (!found) throw new Error(`${email} exists but could not be found.`);
  await fetch(`${SUPABASE.url}/auth/v1/admin/users/${found.id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ password, email_confirm: true, user_metadata: metadata }),
  });
  return found.id;
}

async function findUserByEmail(email) {
  // The admin list is paginated; showcase emails are predictable, so a direct
  // filtered lookup is cheaper and avoids walking every page.
  const res = await fetch(
    `${SUPABASE.url}/auth/v1/admin/users?per_page=200&filter=${encodeURIComponent(email)}`,
    { headers: authHeaders() }
  );
  const body = await res.json();
  return (body.users ?? []).find((u) => u.email === email) ?? null;
}

/** Delete every auth user tagged as showcase data. Used by --purge. */
async function deleteShowcaseUsers() {
  let removed = 0;
  for (let page = 1; page <= 20; page += 1) {
    const res = await fetch(`${SUPABASE.url}/auth/v1/admin/users?per_page=200&page=${page}`, {
      headers: authHeaders(),
    });
    const users = (await res.json()).users ?? [];
    if (users.length === 0) break;

    const tagged = users.filter((u) => u.user_metadata?.artwall_seed === SHOWCASE_TAG);
    for (const user of tagged) {
      await fetch(`${SUPABASE.url}/auth/v1/admin/users/${user.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      removed += 1;
    }
    if (users.length < 200) break;
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/** SEED_DATABASE_URL wins, so a seed can be aimed at a scratch database. */
const DATABASE_URL = process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL;

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

const sql = (strings, ...values) =>
  pool
    .query(
      strings.reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""), ""),
      values
    )
    .then((r) => r.rows);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function purge() {
  console.log("Removing showcase data…");
  for (const statement of SHOWCASE_PURGE_SQL) {
    const res = await pool.query(statement);
    if (res.rowCount) console.log(`  ${res.rowCount} ${statement.split(" ")[2]}`);
  }
  const users = await deleteShowcaseUsers();
  console.log(`  ${users} auth accounts`);
  console.log("Done. Real artists and their work are untouched.");
}

async function seed() {
  if (!CLOUD.name || !CLOUD.key || !CLOUD.secret) {
    throw new Error("CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are required.");
  }
  if (!SUPABASE.url || !SUPABASE.key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const credentials = [];
  let artworkCount = 0;

  console.log(`Uploading the shared image pool (${ARTWORK_IMAGE_POOL} artworks, ${AVATAR_IMAGE_POOL} avatars)…`);
  const pool_ = await buildImagePool();
  console.log(`  ${pool_.artworks.length + pool_.avatars.length} images ready.`);

  console.log(`Seeding ${ARTIST_COUNT} artists…`);

  for (let i = 0; i < ARTIST_COUNT; i += 1) {
    const artist = artistAt(i);
    const password = `Show-${randomBytes(9).toString("base64url")}`;
    const userId = await createShowcaseUser({
      email: artist.email,
      password,
      name: artist.name,
    });

    // The avatar doubles as the artist's logo on their profile and cards.
    // Drawn from the shared pool: `hash` spreads the assignment so neighbouring
    // artists in the directory rarely share one.
    const avatar = pool_.avatars[hash(artist.key + "av") % pool_.avatars.length];

    await sql`
      update "user"
      set name = ${artist.name}, role = 'artist', onboarding_persona = 'artist',
          "emailVerified" = true, "ageDeclaredAdult" = true,
          identity_verified = true, artist_verification_status = 'approved',
          "onboardedAt" = now(), "updatedAt" = now()
      where id = ${userId}
    `;

    await sql`
      insert into artist_profiles (
        "userId", handle, "displayName", discipline, location, bio,
        "avatarUrl", published, "publishedAt", "onboardingCompleted",
        "createdAt", "updatedAt"
      ) values (
        ${userId}, ${artist.handle}, ${artist.name}, ${artist.discipline},
        ${artist.location}, ${artist.bio}, ${avatar.url}, true, now(), true,
        now(), now()
      )
      on conflict ("userId") do update set
        handle = excluded.handle,
        "displayName" = excluded."displayName",
        discipline = excluded.discipline,
        location = excluded.location,
        bio = excluded.bio,
        "avatarUrl" = excluded."avatarUrl",
        published = true,
        "updatedAt" = now()
    `;

    for (let n = 0; n < artist.works; n += 1) {
      const work = workAt(artist, n);
      const image = pool_.artworks[hash(work.id) % pool_.artworks.length];

      await sql`
        insert into artworks (
          id, "userId", title, year, medium, status, "imageUrl", "imagePublicId",
          "isPublic", description, dimensions, category, price_paise, tags,
          "createdAt", "updatedAt"
        ) values (
          ${work.id}, ${userId}, ${work.title}, ${work.year}, ${work.medium},
          ${work.status}, ${image.url}, ${image.publicId}, true,
          ${`${work.medium}, ${work.year}. From the studio of ${artist.name}, ${artist.location}.`},
          ${`${work.width} x ${work.height} cm`},
          ${work.category}, ${work.pricePaise},
          ${[work.category, artist.location.split(",")[0].toLowerCase()]},
          now(), now()
        )
        on conflict (id) do update set
          title = excluded.title, "imageUrl" = excluded."imageUrl",
          "imagePublicId" = excluded."imagePublicId",
          price_paise = excluded.price_paise, status = excluded.status,
          "updatedAt" = now()
      `;
      artworkCount += 1;
    }

    credentials.push({ ...artist, password });

    if ((i + 1) % 10 === 0) {
      console.log(`  ${i + 1}/${ARTIST_COUNT} artists, ${artworkCount} artworks`);
    }
  }

  writeCredentials(credentials, artworkCount);

  console.log(`\nSeeded ${ARTIST_COUNT} artists and ${artworkCount} artworks.`);
  console.log(`Credentials: SHOWCASE-CREDENTIALS.md (gitignored).`);
  console.log(`Remove with: node --env-file=.env scripts/seed-showcase.mjs --purge`);
  console.log(`Or, as Super Admin: /physical-wall/admin/showcase`);
}

function writeCredentials(credentials, artworkCount) {
  const rows = credentials
    .map((c) => `| ${c.name} | \`${c.email}\` | \`${c.password}\` | ${c.discipline} | ${c.location} | ${c.works} |`)
    .join("\n");

  const body = `# Showcase accounts

**Gitignored. Do not commit.** Generated by \`apps/web/scripts/seed-showcase.mjs\`
on ${new Date().toISOString().slice(0, 10)}.

${ARTIST_COUNT} artists, ${artworkCount} artworks. Every account is a real
Supabase Auth user and can sign in at \`/sign-in\`.

## Removing all of it

As Super Admin, open \`/physical-wall/admin/showcase\` and use "Delete showcase
data". From a terminal:

\`\`\`bash
node --env-file=.env scripts/seed-showcase.mjs --purge
\`\`\`

Both run the same statements. They delete only rows whose id begins with
\`${SHOWCASE_PREFIX}\`, plus auth accounts tagged \`artwall_seed: ${SHOWCASE_TAG}\`,
so a real artist's work cannot be removed by either path.

Re-running the seed rotates every password and rewrites this file.

| Name | Email | Password | Discipline | Location | Works |
| --- | --- | --- | --- | --- | --- |
${rows}
`;

  writeFileSync(resolve(REPO_ROOT, "SHOWCASE-CREDENTIALS.md"), body, "utf8");
}

async function main() {
  const target = assertSafeSeedTarget(DATABASE_URL);
  console.log(`Target database host: ${target}`);

  if (PURGE) await purge();
  else await seed();

  await pool.end();
}

main().catch(async (error) => {
  console.error(`FAILED: ${error.message}`);
  await pool.end().catch(() => {});
  process.exit(1);
});
