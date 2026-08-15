/**
 * Seed the physical wall with its starting configuration.
 *
 * Real starting data, not demo fixtures: the '28-slot standard' layout the spec
 * names, the four size classes and six slot types with the prices and
 * multipliers from the product brief, the add-on catalog (minus NFC, removed by
 * C06), refund policy v1, and the settings row.
 *
 * Idempotent — every insert is ON CONFLICT DO NOTHING or guarded by a count, so
 * re-running it after a deploy adds nothing and destroys nothing. It will not
 * touch a grid that already has slots.
 *
 * Usage:  node --env-file=.env scripts/seed-physical-wall.mjs
 */
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Run with:  node --env-file=.env scripts/seed-physical-wall.mjs"
  );
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

/** Rupees to paise, so the table below reads in the units a human quotes. */
const rs = (rupees) => Math.round(rupees * 100);

const SIZES = [
  { id: "s", name: "Small", w: 30, h: 40, kg: 4, price: rs(600), order: 1 },
  { id: "m", name: "Medium", w: 45, h: 60, kg: 7, price: rs(1000), order: 2 },
  { id: "l", name: "Large", w: 60, h: 90, kg: 12, price: rs(1500), order: 3 },
  { id: "xl", name: "X-Large", w: 90, h: 120, kg: 18, price: rs(2200), order: 4 },
];

/** Multipliers as basis points: 10000 = 1.0x. From F05. */
const TYPES = [
  { id: "standard", label: "Standard", bp: 10_000, grant: false, order: 1 },
  { id: "walkin", label: "Walk-in", bp: 13_000, grant: false, order: 2 },
  { id: "premium", label: "Premium", bp: 14_000, grant: false, order: 3 },
  { id: "workshop", label: "Workshop", bp: 15_000, grant: false, order: 4 },
  { id: "featured", label: "Featured", bp: 18_000, grant: false, order: 5 },
  { id: "sponsored", label: "Sponsored", bp: 0, grant: true, order: 6 },
];

/**
 * The add-on catalog.
 *
 * NFC tag installation is deliberately absent: C06 removes NFC entirely, and
 * seeding a line-item we no longer fulfil would be selling something that does
 * not exist. Coffee sits in its own category for the Platter partnership.
 */
const ADDONS = [
  {
    id: "photo",
    label: "Professional photography",
    price: rs(800),
    applies: "artist",
    category: "general",
    order: 1,
  },
  {
    id: "spotlight",
    label: "Spotlight lighting",
    price: rs(400),
    applies: "artist",
    category: "general",
    order: 2,
  },
  {
    id: "featured-listing",
    label: "Homepage featured listing",
    price: rs(500),
    applies: "artist",
    category: "general",
    order: 3,
  },
  {
    id: "content",
    label: "Content package (reel + photoshoot)",
    price: rs(2500),
    applies: "artist",
    category: "general",
    order: 4,
  },
  {
    id: "coffee-opening",
    label: "Opening-day coffee round",
    price: rs(300),
    applies: "both",
    category: "coffee",
    order: 5,
  },
];

const GRID_ID = "grid-28-standard";
const GRID_ROWS = 4;
const GRID_COLS = 7;

/**
 * Which size sits in which row of the standard layout.
 *
 * Large pieces at eye level, small ones at the edges — the layout a curator
 * would choose, not a uniform block. The admin can rearrange all of it.
 */
const ROW_SIZES = ["m", "l", "l", "s"];
const FEATURED_CELLS = new Set(["1-3", "2-3"]);
const WALKIN_CELLS = new Set(["3-0", "3-6"]);

async function seedSizes() {
  for (const size of SIZES) {
    await sql`
      insert into pw_size_catalog
        (id, name, w_cm, h_cm, weight_kg, base_price_paise, active, sort_order)
      values (${size.id}, ${size.name}, ${size.w}, ${size.h}, ${size.kg},
              ${size.price}, true, ${size.order})
      on conflict (id) do nothing
    `;
  }
  console.log(`· ${SIZES.length} size classes`);
}

async function seedTypes() {
  for (const type of TYPES) {
    await sql`
      insert into pw_slot_types
        (id, label, multiplier_bp, requires_grant, active, sort_order)
      values (${type.id}, ${type.label}, ${type.bp}, ${type.grant}, true, ${type.order})
      on conflict (id) do nothing
    `;
  }
  console.log(`· ${TYPES.length} slot types`);
}

async function seedAddons() {
  for (const addon of ADDONS) {
    await sql`
      insert into pw_addon_catalog
        (id, label, price_paise, applies_to, category, active, sort_order)
      values (${addon.id}, ${addon.label}, ${addon.price}, ${addon.applies},
              ${addon.category}, true, ${addon.order})
      on conflict (id) do nothing
    `;
  }
  console.log(`· ${ADDONS.length} add-ons (no NFC line — removed by C06)`);
}

async function seedRefundPolicy() {
  const existing = await sql`select count(*)::int as count from pw_refund_policy`;
  if (existing[0].count > 0) {
    console.log("· refund policy already set");
    return;
  }
  await sql`
    insert into pw_refund_policy (percentage, note)
    values (50, 'Initial policy — confirm the percentage before launch.')
  `;
  console.log("· refund policy v1 (50% — PLACEHOLDER, confirm before launch)");
}

async function seedSettings() {
  /**
   * Group discount tiers are INVENTED. The spec names "5+/10+/full-wall" tiers
   * and gives no percentages. `minSlots: 0` is the sentinel the pricing engine
   * reads as "the whole wall", so the tier tracks the grid size automatically.
   */
  const tiers = JSON.stringify([
    { minSlots: 5, percentBp: 500 },
    { minSlots: 10, percentBp: 1000 },
    { minSlots: 0, percentBp: 1500 },
  ]);

  await sql`
    insert into pw_settings (id, group_discount_tiers)
    values (1, ${tiers}::jsonb)
    on conflict (id) do nothing
  `;
  console.log("· settings row (surge OFF, GST 18%, perk 10%)");
}

async function seedGrid() {
  await sql`
    insert into pw_grid_config (id, name, row_count, col_count, is_template, active)
    values (${GRID_ID}, '28-slot standard', ${GRID_ROWS}, ${GRID_COLS}, true, true)
    on conflict (id) do nothing
  `;

  const existing = await sql`
    select count(*)::int as count from pw_slots where grid_id = ${GRID_ID}
  `;
  if (existing[0].count > 0) {
    console.log(`· grid already has ${existing[0].count} slots — left alone`);
    return;
  }

  let created = 0;
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const cell = `${row}-${col}`;
      const typeId = FEATURED_CELLS.has(cell)
        ? "featured"
        : WALKIN_CELLS.has(cell)
          ? "walkin"
          : "standard";

      // A1, A2 ... D7. Readable off a printed label at the wall.
      const label = `${String.fromCharCode(65 + row)}${col + 1}`;

      await sql`
        insert into pw_slots (id, grid_id, row_index, col_index, label, size_id, type_id, state)
        values (${`${GRID_ID}-${cell}`}, ${GRID_ID}, ${row}, ${col}, ${label},
                ${ROW_SIZES[row]}, ${typeId}, 'available')
        on conflict (id) do nothing
      `;
      created += 1;
    }
  }
  console.log(`· ${created} slots on '28-slot standard'`);
}

console.log("Seeding the physical wall…");
await seedSizes();
await seedTypes();
await seedAddons();
await seedRefundPolicy();
await seedSettings();
await seedGrid();
console.log("\nDone.");
console.log(
  "\nTwo numbers in here are placeholders and need a decision before launch:\n" +
    "  · refund policy percentage (currently 50%)\n" +
    "  · group discount tiers (currently 5% / 10% / 15%)\n" +
    "Both are editable at /physical-wall/admin/catalogs."
);
