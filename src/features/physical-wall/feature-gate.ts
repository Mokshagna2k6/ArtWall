import "server-only";

/**
 * Server-side enforcement of the PHYSICAL_WALL_ENABLED flag (FE-2.17).
 *
 * The /physical-wall layout 404s while the flag is off, but that only hides
 * pages: a server action is callable by id from any route, and an API route
 * has no layout. So every physical-wall server action and API route calls
 * this first. The UI checks are cosmetic; this one is the gate.
 *
 * Deliberately NOT called by the Razorpay webhook or the crons: if the flag is
 * switched off with money in flight, captured payments must still settle or
 * refund, and queued refunds and notices must still go out.
 */
export class FeatureDisabledError extends Error {
  readonly status = 404;
  constructor() {
    super("The physical wall is not open yet.");
    this.name = "FeatureDisabledError";
  }
}

export function physicalWallEnabled(): boolean {
  // Read per call, not captured at import, so tests and a restart with a new
  // env both see the current value.
  // Same env var as features.physicalWall in src/config/site.ts.
  return process.env.PHYSICAL_WALL_ENABLED === "true";
}

export function assertPhysicalWallEnabled(): void {
  if (!physicalWallEnabled()) throw new FeatureDisabledError();
}
