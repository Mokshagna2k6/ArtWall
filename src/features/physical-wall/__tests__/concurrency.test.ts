import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("server-only", () => ({}));

// Hoisted mock objects: vi.mock factories run before any top-level code,
// so the pool/client they close over must be created with vi.hoisted().
const { mockPool, mockClient } = vi.hoisted(() => {
  const mockPool = { connect: vi.fn() };
  const mockClient = { query: vi.fn(), release: vi.fn() };
  return { mockPool, mockClient };
});

// Mock session so requireRole() doesn't hit the real auth module
vi.mock("@/lib/session", () => ({
  getSessionUser: vi.fn(async () => ({
    id: "artist-1",
    name: "Test Artist",
    email: "artist@test.com",
  })),
  getCurrentUser: vi.fn(async () => null),
}));

// Mock next/cache updateTag
vi.mock("next/cache", () => ({
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

// Mock the DB module under both specifier forms used by imports.
// The tagged-template sql() routes through the same mock client; unmatched
// queries return no rows, which makes getActor() fall back to "artist".
const sqlTag = (strings: TemplateStringsArray, ...values: unknown[]) =>
  mockClient.query(strings.join("?"), values);

vi.mock("@/lib/db/index", () => ({ pool: mockPool, getSql: () => sqlTag }));
vi.mock("@/lib/db", () => ({ pool: mockPool, getSql: () => sqlTag }));

/**
 * Concurrency test: 50 parallel booking attempts against the same slot cannot
 * produce a double booking.
 *
 * The `FOR UPDATE` row lock in `reserveBooking` means only one attempt can
 * succeed; the other 49 must fail. This test simulates that behaviour with a
 * mock of the database layer that serializes access exactly like Postgres
 * row locks do.
 */

let lockHeld = false;
let lockQueue: (() => void)[] = [];
let slotState = "available";
let bookingCount = 0;

function acquireLock() {
  return new Promise<void>((resolve) => {
    if (!lockHeld) {
      lockHeld = true;
      resolve();
    } else {
      lockQueue.push(resolve);
    }
  });
}

function releaseLock() {
  if (lockQueue.length > 0) lockQueue.shift()!();
  else lockHeld = false;
}

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "test-auth-secret-32-characters!!";

  mockPool.connect.mockImplementation(async () => {
    await acquireLock();
    return mockClient;
  });

  mockClient.release.mockImplementation(() => releaseLock());

  mockClient.query.mockImplementation(async (query: string) => {
    const q = query.toLowerCase();
    if (q.includes("begin") || q.includes("commit") || q.includes("rollback")) {
      return { rowCount: 0 };
    }
    if (q.includes("for update of s")) {
      return {
        rows: [
          {
            id: "slot-1",
            state: slotState,
            label: "A1",
            base_price_paise: 10000,
            multiplier_bp: 10000,
          },
        ],
        rowCount: 1,
      };
    }
    if (q.includes("pw_booking_slots") || q.includes("from artworks")) {
      return { rows: [], rowCount: 0 };
    }
    if (q.includes("insert into pw_bookings")) {
      bookingCount += 1;
      return { rowCount: 1 };
    }
    if (
      q.includes("insert into pw_booking_slots") ||
      q.includes("insert into pw_booking_addons") ||
      q.includes("insert into pw_audit_log")
    ) {
      return { rowCount: 1 };
    }
    if (q.includes("update pw_slots")) {
      if (slotState === "available") {
        slotState = "reserved";
        return { rowCount: 1 };
      }
      return { rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });
});

afterAll(() => {
  delete process.env.BETTER_AUTH_SECRET;
  vi.restoreAllMocks();
});

describe("Concurrent slot reservation", () => {
  it("50 parallel attempts cannot produce a double booking", async () => {
    slotState = "available";
    bookingCount = 0;
    lockHeld = false;
    lockQueue = [];

    const { reserveBooking } = await import("../actions/booking");

    const attempts = Array.from({ length: 50 }, () => {
      const fd = new FormData();
      fd.set("slotIds", "slot-1");
      fd.set("durationDays", "7");
      fd.set("startDate", "2026-09-01");
      fd.set("addonIds", "");
      return reserveBooking({ status: "idle" }, fd);
    });

    const results = await Promise.all(attempts);
    const successes = results.filter((r) => r.status === "ok");
    const failures = results.filter((r) => r.status === "error");

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(49);
    expect(bookingCount).toBe(1);
    expect(slotState).toBe("reserved");
  }, 20000);
});