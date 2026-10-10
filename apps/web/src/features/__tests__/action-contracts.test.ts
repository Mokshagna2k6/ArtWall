import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * BE-2.14 / BE-2.15: the contract every server action in src/features/**\/actions*
 * keeps, checked two ways.
 *
 * 1. Statically, over every exported async function in every "use server"
 *    actions file:
 *    - an action that takes input parses it with zod (safeParse / parse /
 *      parseInput / formInput) before its first database call. Resolving the
 *      caller's own session or role (no client input involved) may come first.
 *    - every action that touches anything fallible handles its errors
 *      (try/catch, attempt(), readSafely()), so nothing is thrown to the client.
 * 2. At runtime, with the database failing: sampled actions from each feature
 *    return a result whose message contains no SQL.
 */

const FEATURES = join(__dirname, "..");
const DB_CALL = /getSql\(|\bsql`|sql\.query\(|\bdb\s*\.|\bdb\n|\bpool\.|inTransaction\(|client\.query\(/;
const ZOD_PARSE = /\.safeParse\(|\.parse\(|parseInput\(|formInput\(/;
const HANDLED = /\btry \{|\battempt\(|\breadSafely\(/;
/** Actions that return a constant: no input, no I/O, nothing to validate or catch. */
const CONSTANT = new Set(["getLedgerCategories", "getTierOrder"]);

function actionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : actionFiles(path);
    const inActions = relative(FEATURES, path).split(/[\\/]/).some((part) => part.startsWith("actions"));
    return inActions && name.endsWith(".ts") ? [path] : [];
  });
}

function exportedActions(file: string) {
  const src = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (!/^["']use server["'];/.test(src.trimStart())) return [];
  return [...src.matchAll(/^export async function (\w+)\(([^)]*)\)/gm)].map((m) => {
    const start = m.index! + m[0].length;
    const end = src.indexOf("\n}\n", start);
    return { name: m[1], hasInput: m[2].replace(/_previous: \w+,?/, "").trim() !== "", body: src.slice(start, end) };
  });
}

const files = actionFiles(FEATURES);
const actions = files.flatMap((f) => exportedActions(f).map((a) => ({ ...a, file: relative(FEATURES, f) })));

describe("server action contract, static (BE-2.14 / BE-2.15)", () => {
  it("finds the action files", () => {
    expect(files.length).toBeGreaterThanOrEqual(25);
    expect(actions.length).toBeGreaterThanOrEqual(100);
  });

  it("every action with input validates it with zod before any database call", () => {
    const violations = actions
      .filter((a) => a.hasInput)
      .filter((a) => {
        const zod = a.body.search(ZOD_PARSE);
        const dbCall = a.body.search(DB_CALL);
        return zod === -1 || (dbCall !== -1 && dbCall < zod);
      })
      .map((a) => `${a.file}: ${a.name}`);
    expect(violations).toEqual([]);
  });

  it("every action handles its own errors (no raw throw to the client)", () => {
    const violations = actions
      .filter((a) => !CONSTANT.has(a.name) && !HANDLED.test(a.body))
      .map((a) => `${a.file}: ${a.name}`);
    expect(violations).toEqual([]);
  });
});

// ── runtime: the database is down and says so in SQL ────────────────────────
const SQL_ERROR = 'relation "pw_bookings" does not exist at character 15: select * from pw_bookings where id = $1';

vi.mock("@/lib/db", () => {
  const boom = () => {
    throw new Error(SQL_ERROR);
  };
  const sql = Object.assign(async () => boom(), { query: async () => boom() });
  return { getSql: () => sql, DatabaseNotConfiguredError: class extends Error {} };
});
vi.mock("@/lib/db/index", () => {
  const fail = async () => {
    throw new Error(SQL_ERROR);
  };
  const db = new Proxy({}, { get: () => () => { throw new Error(SQL_ERROR); } });
  return { pool: { connect: fail, query: fail, on: () => {} }, db };
});
vi.mock("@/features/physical-wall/authorize", () => {
  const actor = { id: "u1", name: "Asha", email: "a@example.test", role: "admin" };
  return {
    NotAuthorisedError: class extends Error {},
    NotAuthorisedAdminRoleError: class extends Error {},
    PhysicalWallDisabledError: class extends Error {},
    requirePhysicalWallEnabled: vi.fn(),
    getActor: vi.fn(async () => actor),
    requireRole: vi.fn(async () => actor),
    hasRole: () => true,
    // SEC-3.02: approveCurator/reviewIdentity now call requireAdminRole
    // (additional to requireRole("admin") above) for curator_admin /
    // compliance_admin — this contract suite only cares that the generic
    // "DB is down" / "bad input" behaviour still holds, not the specific
    // admin-role check, so it mocks this as always-granted too.
    requireAdminRole: vi.fn(async () => actor),
    hasAdminRole: vi.fn(async () => true),
  };
});
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "u1" } }) } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/cache", () => ({
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const idle = { status: "idle" } as never;

describe("server action contract, runtime (BE-2.15)", () => {
  it("a database failure comes back as a flat message, never SQL text", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { attachArtwork } = await import("@/features/physical-wall/actions/booking");
    const { closeGrievance } = await import("@/features/physical-wall/actions/admin-ops");
    const { setSlotServiceState } = await import("@/features/physical-wall/actions/admin-slots");
    const { createExhibition, publishExhibition } = await import("@/features/exhibitions/actions");
    const { approveCurator } = await import("@/features/curators/actions");
    const { createTag } = await import("@/features/art-tags/actions");
    const { issueCertificate } = await import("@/features/coa/actions");

    const results = [
      await attachArtwork(idle, form({ bookingId: "bk_1", artworkId: "art_1" })),
      await closeGrievance(idle, form({ grievanceId: "gr_1" })),
      await setSlotServiceState(idle, form({ slotId: "s1", to: "blocked" })),
      await createExhibition({ title: "Show" }),
      await publishExhibition("exh_1"),
      await approveCurator("cur_1"),
      await createTag({ tagType: "qr", tagUid: "ABCD1234" }),
      await issueCertificate("art_1"),
    ];
    for (const r of results) {
      const text = JSON.stringify(r);
      expect(text).not.toMatch(/relation|select|pw_bookings|\$1/);
      expect(text).toMatch(/didn't work|logged/);
    }
  });

  it("invalid input is refused before the database is touched, with the zod message", async () => {
    const { attachArtwork } = await import("@/features/physical-wall/actions/booking");
    const { createExhibition } = await import("@/features/exhibitions/actions");
    const { approveCurator } = await import("@/features/curators/actions");
    // With a failing database, reaching it would produce the generic message instead.
    expect(await attachArtwork(idle, form({ bookingId: "bk_1" }))).toEqual({ status: "error", message: "Choose an artwork." });
    expect(await createExhibition({ title: "  " })).toEqual({ ok: false, error: "Give the exhibition a title." });
    expect((await approveCurator("")).ok).toBe(false);
    expect(await approveCurator({ $ne: null } as never)).toMatchObject({ ok: false });
  });
});
