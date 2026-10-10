/**
 * The slot lifecycle (F04).
 *
 * A slot on the physical wall is only ever in one of nine states, and only the
 * moves listed here are legal. This module is the single source of truth for
 * that: every path that changes a slot's state goes through `assertTransition`,
 * so an illegal move is impossible to write by accident in an action.
 *
 * Deliberately pure — no database, no session, no imports from the app. That
 * makes the rules readable on their own and testable without a connection.
 */

export const SLOT_STATES = [
  "available",
  "reserved",
  "booked",
  "received",
  "installed",
  "live",
  "ended",
  "maintenance",
  "blocked",
] as const;

export type SlotState = (typeof SLOT_STATES)[number];

/**
 * Permitted moves, transcribed from the spec's F04 block.
 *
 * `booked -> available` is the force-release path and `ended -> available` is
 * the natural one; both land in the same place but only one of them is
 * something an artist can cause.
 */
export const SLOT_TRANSITIONS: Record<SlotState, readonly SlotState[]> = {
  available: ["reserved", "booked", "maintenance", "blocked"],
  reserved: ["booked", "available"],
  booked: ["received", "available"],
  received: ["installed", "booked"],
  installed: ["live", "received"],
  live: ["ended"],
  ended: ["available"],
  maintenance: ["available", "blocked"],
  blocked: ["available"],
};

/**
 * Moves only an admin may make, regardless of the map above (F12).
 *
 * These bypass availability and payment checks by design, which is precisely
 * why they are enumerated rather than inferred, and why every one of them is
 * written to the audit log by its caller.
 */
const ADMIN_ONLY: ReadonlySet<string> = new Set([
  "available->booked",
  "booked->available",
  "live->ended",
  "received->booked",
  "installed->received",
  "available->maintenance",
  "available->blocked",
  "maintenance->blocked",
  "maintenance->available",
  "blocked->available",
]);

/** Terminal in the sense that the wall is done with the piece for now. */
export const OCCUPIED_STATES: readonly SlotState[] = [
  "reserved",
  "booked",
  "received",
  "installed",
  "live",
];

/**
 * Is a slot carrying a commitment we must not destroy?
 *
 * Used by the grid editor: a re-config may shrink the wall, but never out from
 * under a booking that someone has paid for (F01).
 */
export function isOccupied(state: SlotState): boolean {
  return OCCUPIED_STATES.includes(state);
}

export function isSlotState(value: unknown): value is SlotState {
  return (
    typeof value === "string" && (SLOT_STATES as readonly string[]).includes(value)
  );
}

export function canTransition(from: SlotState, to: SlotState): boolean {
  return SLOT_TRANSITIONS[from].includes(to);
}

export function requiresAdmin(from: SlotState, to: SlotState): boolean {
  return ADMIN_ONLY.has(`${from}->${to}`);
}

/**
 * Thrown for an illegal move. Carries a 409 because that is what the state
 * machine is saying: not "you asked wrongly" but "the world is not in the shape
 * your request assumed" — usually because someone else moved first.
 */
export class IllegalTransitionError extends Error {
  readonly status = 409;
  constructor(
    readonly from: SlotState,
    readonly to: SlotState,
    message?: string
  ) {
    super(message ?? `A slot cannot move from ${from} to ${to}.`);
    this.name = "IllegalTransitionError";
  }
}

export class ForbiddenTransitionError extends Error {
  readonly status = 403;
  constructor(
    readonly from: SlotState,
    readonly to: SlotState
  ) {
    super(`Moving a slot from ${from} to ${to} is an admin action.`);
    this.name = "ForbiddenTransitionError";
  }
}

/**
 * Guard a state change, or throw.
 *
 * `isAdmin` is passed in rather than read from the session so this stays pure
 * and the caller is forced to have already established who is asking.
 */
export function assertTransition(
  from: SlotState,
  to: SlotState,
  { isAdmin }: { isAdmin: boolean }
): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
  if (requiresAdmin(from, to) && !isAdmin) {
    throw new ForbiddenTransitionError(from, to);
  }
}

/** Human-facing labels and a tone for each state, used by the badge component. */
export const SLOT_STATE_META: Record<
  SlotState,
  { label: string; tone: "ok" | "warn" | "busy" | "off" }
> = {
  available: { label: "Available", tone: "ok" },
  reserved: { label: "Reserved", tone: "warn" },
  booked: { label: "Booked", tone: "busy" },
  received: { label: "Received", tone: "busy" },
  installed: { label: "Installed", tone: "busy" },
  live: { label: "Live", tone: "ok" },
  ended: { label: "Ended", tone: "off" },
  maintenance: { label: "Maintenance", tone: "warn" },
  blocked: { label: "Blocked", tone: "off" },
};
