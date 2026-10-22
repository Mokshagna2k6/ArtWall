/**
 * Virtual Wall showcase: a walkable gallery building hung with showcase art.
 *
 *   node --env-file=.env scripts/seed-virtual-wall.mjs
 *   node --env-file=.env scripts/seed-virtual-wall.mjs --purge
 *
 * ## Why this exists
 *
 * `/virtual` renders the WallOS hierarchy (buildings -> floors -> rooms_zones
 * -> walls -> slots, migration 0050) and whatever `virtual_wall_placements`
 * (0073) says hangs on each slot. The geometry is *derived* from hierarchy
 * order by `src/features/wallos/virtual-wall/layout.ts` — so the only way to
 * give a visitor a building to walk through is to insert hierarchy rows and
 * placements. There were none worth walking: one wall, three slots, zero
 * placements, so the 3D view was a bare room.
 *
 * `seed-showcase.mjs` already created the catalogue (100 artists, 448 public
 * artworks). This script does not create any art: it only hangs art that is
 * already there, reusing the existing Cloudinary URLs on those rows. No image
 * is uploaded (the account is on the free tier).
 *
 * ## Delete safety — identical rule to seed-showcase.mjs
 *
 * **Every row written here has an id prefixed `show_`.** The purge matches
 * only that prefix, so it cannot reach a real venue's building or a real
 * placement. The same statements run from the admin UI via `purgeShowcaseData`
 * in src/features/admin/showcase.ts; `showcase.test.ts` asserts the two paths
 * target the same tables and that every delete is prefix-guarded.
 *
 * The existing `venue_default` is reused rather than seeded: a building needs a
 * venue, and creating one would mean seeding organizations too for no gain.
 *
 * ## Idempotent
 *
 * Hierarchy ids are deterministic (`show_vw_f0_w1_s2`) and inserted with
 * `on conflict do nothing`/`do update`. Placements are keyed by slot, and a
 * slot that already has a live placement is left alone — so a re-run is a
 * no-op rather than a duplicate, and 0073's partial unique indexes are never
 * fought with.
 */

import { pathToFileURL } from "node:url";

import pg from "pg";

import { assertSafeSeedTarget } from "./seed-guard.mjs";

const PURGE = process.argv.includes("--purge");

/** Must match seed-showcase.mjs and src/features/admin/showcase.ts. */
export const SHOWCASE_PREFIX = "show_";

/** Venue that owns the showcase building. Pre-existing; never created or deleted here. */
const VENUE_ID = "venue_default";

const BUILDING_ID = `${SHOWCASE_PREFIX}vw_building`;
const BUILDING_NAME = "ArtWall Gallery (showcase)";

/**
 * Six floors of four walls of six slots = 144 works on show.
 *
 * Four walls per floor because `wallPose` puts walls 0-3 on the room's four
 * sides and starts a second, smaller inner ring at wall 5 — four keeps every
 * wall on the perimeter where a visitor can stand back from it. Six slots
 * because the wall plane is `ROOM_HALF * 2` = 16m and SLOT_PITCH is 2.4m, so
 * six centred slots span 12m and stay clear of the corners.
 */
const FLOORS = 6;
const WALLS_PER_FLOOR = 4;
const SLOTS_PER_WALL = 6;

const FLOOR_NAMES = [
  "Ground Floor",
  "First Floor",
  "Second Floor",
  "Third Floor",
  "Fourth Floor",
  "Fifth Floor",
];

/** One room per floor — the layout lays walls out per floor, not per room. */
const ROOM_NAMES = [
  "Main Hall",
  "Painting Gallery",
  "Photography Gallery",
  "Sculpture Court",
  "Print Room",
  "Textile and Mixed Media",
];

/** Walls are ordered by name in the read query, so the names must sort 1..4. */
const WALL_NAMES = ["Wall 1 (North)", "Wall 2 (East)", "Wall 3 (South)", "Wall 4 (West)"];

// ---------------------------------------------------------------------------
// Purge — ordered child-to-parent so foreign keys never block a delete.
// ---------------------------------------------------------------------------

/**
 * Deletes that remove everything this script writes, in dependency order.
 * 0050's foreign keys are all `on delete restrict`, so the order matters.
 * Exported so the admin action can run exactly these statements.
 */
export const VIRTUAL_WALL_PURGE_SQL = [
  `delete from virtual_wall_placements where id like '${SHOWCASE_PREFIX}%'`,
  `delete from slots where id like '${SHOWCASE_PREFIX}%'`,
  `delete from walls where id like '${SHOWCASE_PREFIX}%'`,
  `delete from rooms_zones where id like '${SHOWCASE_PREFIX}%'`,
  `delete from floors where id like '${SHOWCASE_PREFIX}%'`,
  `delete from buildings where id like '${SHOWCASE_PREFIX}%'`,
];

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
  console.log("Removing the showcase virtual building…");
  for (const statement of VIRTUAL_WALL_PURGE_SQL) {
    const res = await pool.query(statement);
    if (res.rowCount) console.log(`  ${res.rowCount} ${statement.split(" ")[2]}`);
  }
  console.log("Done. Real buildings and real placements are untouched.");
}

async function seed() {
  // Only public artworks: §A13, and `getVirtualBuilding` narrows its join to
  // public works anyway, so a private one would render as an empty slot.
  // Ordered by id so the hang is the same on every run.
  const art = await sql`
    select id from artworks
    where id like ${`${SHOWCASE_PREFIX}%`} and "isPublic" = true
    order by id
  `;
  if (art.length === 0) {
    throw new Error(
      "No public showcase artworks found. Run scripts/seed-showcase.mjs first."
    );
  }
  console.log(`${art.length} showcase artworks available to hang.`);

  await sql`
    insert into buildings (id, venue_id, name)
    values (${BUILDING_ID}, ${VENUE_ID}, ${BUILDING_NAME})
    on conflict (id) do update set name = excluded.name, updated_at = now()
  `;

  let slotCount = 0;
  let placed = 0;
  let alreadyPlaced = 0;
  // Walks the catalogue in order, so slot N always gets artwork N: the hang is
  // stable across runs and every artwork hangs at most once (0073's partial
  // unique index on artwork_id forbids the same work on two live slots).
  let nextArt = 0;

  for (let f = 0; f < FLOORS; f += 1) {
    const floorId = `${SHOWCASE_PREFIX}vw_f${f}`;
    const roomId = `${SHOWCASE_PREFIX}vw_f${f}_room`;

    await sql`
      insert into floors (id, building_id, name, level)
      values (${floorId}, ${BUILDING_ID}, ${FLOOR_NAMES[f]}, ${f})
      on conflict (id) do update set name = excluded.name, level = excluded.level,
        updated_at = now()
    `;
    await sql`
      insert into rooms_zones (id, floor_id, name)
      values (${roomId}, ${floorId}, ${ROOM_NAMES[f]})
      on conflict (id) do update set name = excluded.name, updated_at = now()
    `;

    for (let w = 0; w < WALLS_PER_FLOOR; w += 1) {
      const wallId = `${SHOWCASE_PREFIX}vw_f${f}_w${w}`;
      await sql`
        insert into walls (id, room_zone_id, name)
        values (${wallId}, ${roomId}, ${WALL_NAMES[w]})
        on conflict (id) do update set name = excluded.name, updated_at = now()
      `;

      for (let s = 0; s < SLOTS_PER_WALL; s += 1) {
        const slotId = `${SHOWCASE_PREFIX}vw_f${f}_w${w}_s${s}`;
        // Labels sort by `label` in the read query, so single digits are fine
        // at six per wall and keep the slot order the along-wall order.
        await sql`
          insert into slots (id, wall_id, label)
          values (${slotId}, ${wallId}, ${`${f}-${w + 1}-${s + 1}`})
          on conflict (id) do update set label = excluded.label, updated_at = now()
        `;
        slotCount += 1;

        if (nextArt >= art.length) continue;

        // Idempotency: a slot that already shows something is left as it is,
        // so a re-run neither duplicates nor silently rehangs the gallery.
        const live = await sql`
          select id from virtual_wall_placements
          where slot_id = ${slotId} and removed_at is null limit 1
        `;
        if (live.length > 0) {
          alreadyPlaced += 1;
          nextArt += 1;
          continue;
        }

        const artworkId = art[nextArt].id;
        nextArt += 1;
        // `placed_by` is left null: nobody hung this by hand. The column is
        // nullable and `on delete set null`, so null is the honest value.
        const res = await pool.query(
          `insert into virtual_wall_placements (id, slot_id, artwork_id)
           values ($1, $2, $3)
           on conflict do nothing`,
          [`${SHOWCASE_PREFIX}vwp_f${f}_w${w}_s${s}`, slotId, artworkId]
        );
        placed += res.rowCount;
      }
    }
    console.log(`  ${FLOOR_NAMES[f]}: ${WALLS_PER_FLOOR} walls, ${SLOTS_PER_WALL * WALLS_PER_FLOOR} slots`);
  }

  console.log(
    `\n${FLOORS} floors, ${slotCount} slots, ${placed} works hung` +
      (alreadyPlaced ? ` (${alreadyPlaced} slots already had art and were left alone)` : "")
  );
  console.log(`Walk it at: /virtual/${BUILDING_ID}`);
  console.log(`Remove with: node --env-file=.env scripts/seed-virtual-wall.mjs --purge`);
  console.log(`Or, as Super Admin: /physical-wall/admin/showcase`);
}

async function main() {
  const target = assertSafeSeedTarget(DATABASE_URL);
  console.log(`Target database host: ${target}`);

  if (PURGE) await purge();
  else await seed();

  await pool.end();
}

// Guarded: seed-showcase.mjs imports VIRTUAL_WALL_PURGE_SQL from here so the
// two purge paths cannot drift, and importing must not start a seed.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (error) => {
    console.error(`FAILED: ${error.message}`);
    await pool.end().catch(() => {});
    process.exit(1);
  });
}
