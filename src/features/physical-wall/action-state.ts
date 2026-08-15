/**
 * The shape a physical-wall server action returns.
 *
 * In its own module, separate from actions/shared.ts, and that separation is
 * load-bearing rather than tidiness: every client form needs the `ActionState`
 * type and the `IDLE` initial value, and `IDLE` is a *value*, so importing it
 * from actions/shared.ts pulls that module — and with it the `pg` connection
 * pool — into the browser bundle. Which fails the build, and would be a
 * connection string in a client bundle if it didn't.
 *
 * Nothing in this file may import anything server-side. That is the whole point
 * of it existing.
 */

export type ActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; message: string; data?: unknown };

export const IDLE: ActionState = { status: "idle" };
