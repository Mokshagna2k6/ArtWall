#!/usr/bin/env node
/**
 * Seed demo venues: real-looking cafés, restaurants and hotels across Indian
 * cities, each with a building, floor, room, walls and priced slots.
 *
 * Why a script and not a migration: this is sample content, not schema. A
 * migration runs once per database and is the wrong place for rows a developer
 * may want to re-seed, adjust or drop. Migration 0086 adds the *columns*; this
 * fills them with something to look at.
 *
 * Usage:
 *   node --env-file=apps/web/.env packages/db/scripts/seed-demo-venues.mjs
 *   node --env-file=apps/web/.env packages/db/scripts/seed-demo-venues.mjs --remove
 *
 * Idempotent: every id is deterministic (`demo_*`) and every insert is an
 * upsert, so running it twice changes nothing the second time. That also makes
 * the whole set removable with one predictable WHERE (the --remove flag).
 *
 * Prices are plausible monthly rates for café/restaurant wall space in these
 * cities; they are sample data, not a pricing decision.
 */

import pg from "pg";

// Same convention as migrate.mjs: the env file is passed on the command line
// (`node --env-file=apps/web/.env ...`), not loaded by a dependency.
const connectionString =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "DATABASE_URL is not set. Run with:\n" +
      "  node --env-file=apps/web/.env packages/db/scripts/seed-demo-venues.mjs"
  );
  process.exit(1);
}

/**
 * One entry per venue. `walls` is a list of [name, widthCm, heightCm, note],
 * and `slots` says how many hanging positions that wall has and what each
 * costs per 30 days, in rupees.
 */
const VENUES = [
  {
    key: "thirdwave_indiranagar",
    org: "Third Wave Coffee",
    name: "Third Wave Coffee, Indiranagar",
    type: "cafe",
    address: "100 Feet Road, Indiranagar",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560038",
    description:
      "Corner café on 100 Feet Road. Steady all-day footfall, heaviest between 8am and noon. South-facing windows, so the long wall gets indirect light all afternoon.",
    walls: [
      ["Long wall, left of counter", 420, 260, "Indirect daylight, no direct sun. The most-seen wall in the room.", 4, 2500],
      ["Stairwell wall", 180, 300, "Tall and narrow. Suits one large portrait work.", 2, 1800],
    ],
  },
  {
    key: "blue_tokai_hauzkhas",
    org: "Blue Tokai Coffee Roasters",
    name: "Blue Tokai, Hauz Khas",
    type: "cafe",
    address: "Deer Park Road, Hauz Khas Village",
    city: "New Delhi",
    state: "Delhi",
    pincode: "110016",
    description:
      "Roastery café in Hauz Khas Village, next to the gallery district. Visitors are already out looking at art.",
    walls: [
      ["Roastery wall", 500, 280, "Faces the seating. Warm bulbs, no window glare.", 5, 3200],
      ["Entry passage", 240, 240, "First wall a visitor sees walking in.", 2, 2800],
    ],
  },
  {
    key: "kalaghoda_cafe",
    org: "Kala Ghoda Hospitality",
    name: "Kala Ghoda Café",
    type: "restaurant",
    address: "Rampart Row, Kala Ghoda, Fort",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    description:
      "In the Kala Ghoda arts precinct, a few minutes from Jehangir Art Gallery. Evening dinner crowd, gallery visitors by day.",
    walls: [
      ["Dining room, west wall", 600, 300, "The main dining wall. Dimmable spots on a track.", 6, 4500],
      ["Bar wall", 320, 220, "Lit from below. Best for bold, high-contrast work.", 3, 3800],
    ],
  },
  {
    key: "taj_connemara",
    org: "Connemara Hospitality",
    name: "The Connemara Lounge",
    type: "hotel",
    address: "Binny Road, Anna Salai",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600002",
    description:
      "Hotel lounge off the main lobby. Business travellers and long sit-downs — work here gets looked at properly, not walked past.",
    walls: [
      ["Lobby lounge, north wall", 540, 320, "Museum-grade track lighting already installed.", 4, 6500],
      ["Corridor to banquet hall", 400, 260, "High traffic during events.", 4, 4200],
    ],
  },
  {
    key: "fabcafe_jubilee",
    org: "Fab Hospitality",
    name: "Fab Café, Jubilee Hills",
    type: "cafe",
    address: "Road No. 36, Jubilee Hills",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500033",
    description:
      "Design-led café with a young weekend crowd. Rotates its wall every month.",
    walls: [
      ["Main wall", 380, 250, "Plain white, even light. The easiest wall here to hang on.", 4, 2200],
    ],
  },
  {
    key: "barista_fcroad",
    org: "FC Road Coffee",
    name: "Barista, FC Road",
    type: "cafe",
    address: "Fergusson College Road, Shivajinagar",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411004",
    description:
      "Student crowd from the colleges on FC Road. Lower prices, very high footfall.",
    walls: [
      ["Window wall", 300, 230, "Bright, direct sun in the morning. Not for works sensitive to light.", 3, 1500],
      ["Back wall", 260, 230, "No daylight, fully lit by spots.", 2, 1200],
    ],
  },
  {
    key: "parkstreet_gallery",
    org: "Park Street Arts",
    name: "Park Street Gallery Café",
    type: "gallery",
    address: "Park Street, Maidan",
    city: "Kolkata",
    state: "West Bengal",
    pincode: "700016",
    description:
      "A working gallery with a café in front. Walls are hung and lit to gallery standard, and the staff know how to talk about the work.",
    walls: [
      ["Main gallery, long wall", 700, 320, "Proper gallery hanging system and adjustable lighting.", 6, 5500],
      ["Café wall", 340, 260, "Street-facing, visible through the window from Park Street.", 3, 3500],
    ],
  },
  {
    key: "cowrks_koramangala",
    org: "CoWrks",
    name: "CoWrks, Koramangala",
    type: "coworking",
    address: "80 Feet Road, 4th Block, Koramangala",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560034",
    description:
      "Coworking floor with 300 members. Longer bookings than a café — members see the same work every day for a month.",
    walls: [
      ["Reception wall", 450, 280, "The first thing every member and visitor passes.", 4, 3000],
      ["Phone booth corridor", 280, 240, "Quieter, closer viewing distance.", 3, 2000],
    ],
  },
];

const removing = process.argv.includes("--remove");

// A local container has no SSL; a hosted Postgres requires it. Decided from
// the host rather than a flag so the same command works against both.
const localHost = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);

const client = new pg.Client({
  connectionString,
  ssl: localHost ? false : { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  await client.query("begin");
  try {
    if (removing) {
      await remove();
    } else {
      await seed();
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

async function remove() {
  // Children first: every FK in this hierarchy is `on delete restrict`.
  // Placements are removed too, since a demo slot may have art on it.
  const steps = [
    `delete from virtual_wall_placements where slot_id in
       (select id from slots where id like 'demo_%')`,
    `delete from slots where id like 'demo_%'`,
    `delete from walls where id like 'demo_%'`,
    `delete from rooms_zones where id like 'demo_%'`,
    `delete from floors where id like 'demo_%'`,
    `delete from buildings where id like 'demo_%'`,
    `delete from venue_role_assignments where venue_id like 'demo_%'`,
    `delete from venues where id like 'demo_%'`,
    `delete from organizations where id like 'demo_%'`,
  ];
  for (const sql of steps) {
    const { rowCount } = await client.query(sql);
    if (rowCount) console.log(`  removed ${rowCount} row(s)`);
  }
  console.log("Demo venues removed.");
}

async function seed() {
  let wallCount = 0;
  let slotCount = 0;

  for (const v of VENUES) {
    const orgId = `demo_org_${v.key}`;
    const venueId = `demo_venue_${v.key}`;
    const buildingId = `demo_bldg_${v.key}`;
    const floorId = `demo_floor_${v.key}`;
    const zoneId = `demo_zone_${v.key}`;

    await client.query(
      `insert into organizations (id, name) values ($1, $2)
         on conflict (id) do update set name = excluded.name`,
      [orgId, v.org]
    );

    await client.query(
      `insert into venues
         (id, organization_id, name, venue_type, address_line, city, state, pincode, description, listed)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
       on conflict (id) do update set
         name = excluded.name,
         venue_type = excluded.venue_type,
         address_line = excluded.address_line,
         city = excluded.city,
         state = excluded.state,
         pincode = excluded.pincode,
         description = excluded.description,
         listed = excluded.listed`,
      [venueId, orgId, v.name, v.type, v.address, v.city, v.state, v.pincode, v.description]
    );

    await client.query(
      `insert into buildings (id, venue_id, name) values ($1,$2,$3)
         on conflict (id) do update set name = excluded.name`,
      [buildingId, venueId, v.name]
    );
    await client.query(
      `insert into floors (id, building_id, name, level) values ($1,$2,'Ground floor',0)
         on conflict (id) do nothing`,
      [floorId, buildingId]
    );
    await client.query(
      `insert into rooms_zones (id, floor_id, name) values ($1,$2,'Main room')
         on conflict (id) do nothing`,
      [zoneId, floorId]
    );

    for (const [index, wall] of v.walls.entries()) {
      const [name, widthCm, heightCm, notes, slots, rupees] = wall;
      const wallId = `demo_wall_${v.key}_${index}`;

      await client.query(
        `insert into walls (id, room_zone_id, name, width_cm, height_cm, notes)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (id) do update set
           name = excluded.name,
           width_cm = excluded.width_cm,
           height_cm = excluded.height_cm,
           notes = excluded.notes`,
        [wallId, zoneId, name, widthCm, heightCm, notes]
      );
      wallCount += 1;

      for (let s = 0; s < slots; s += 1) {
        const slotId = `demo_slot_${v.key}_${index}_${s}`;
        // Slot width divides the wall; height leaves a hanging margin.
        const slotWidth = Math.floor(widthCm / slots) - 10;
        await client.query(
          `insert into slots
             (id, wall_id, label, price_paise, period_days, width_cm, height_cm)
           values ($1,$2,$3,$4,30,$5,$6)
           on conflict (id) do update set
             label = excluded.label,
             price_paise = excluded.price_paise,
             period_days = excluded.period_days,
             width_cm = excluded.width_cm,
             height_cm = excluded.height_cm`,
          [
            slotId,
            wallId,
            `${String.fromCharCode(65 + index)}${s + 1}`,
            rupees * 100,
            slotWidth > 0 ? slotWidth : null,
            heightCm - 40 > 0 ? heightCm - 40 : null,
          ]
        );
        slotCount += 1;
      }
    }
    console.log(`  ${v.name} — ${v.city}`);
  }

  console.log(
    `\nSeeded ${VENUES.length} venues, ${wallCount} walls, ${slotCount} priced slots.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
