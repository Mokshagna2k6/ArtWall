import "server-only";

import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

import { NotAuthorisedError } from "@/features/physical-wall/authorize";
import {
  ForbiddenTransitionError,
  IllegalTransitionError,
} from "@/features/physical-wall/state-machine";
import type { ActionState } from "@/features/physical-wall/action-state";
import { pool } from "@/lib/db/index";

/**
 * Shared plumbing for the physical-wall server actions.
 *
 * The action-result shape matches the rest of the project
 * (src/features/admin/actions.ts, src/features/wall/actions.ts) so forms can use
 * `useActionState` without a per-feature adapter.
 */

export type { ActionState } from "@/features/physical-wall/action-state";

export function ok(message: string, data?: unknown): ActionState {
  return { status: "ok", message, data };
}

export function fail(message: string): ActionState {
  return { status: "error", message };
}

/** Short, URL-safe, unguessable. Used for every id we mint. */
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

/**
 * Run a function inside a real transaction.
 *
 * Uses the `pg` Pool rather than the Neon HTTP client. This matters: the HTTP
 * driver in src/lib/db.ts sends each statement as an independent request and
 * **cannot hold a transaction or a row lock**, so a multi-slot reservation
 * written against it would have no atomicity at all. Anything that must be
 * all-or-nothing goes through here.
 */
export async function inTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {
      // A rollback that itself fails means the connection is already broken;
      // releasing it below discards it. Swallowing here keeps the original
      // error — the one that explains what actually went wrong — intact.
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Turn a thrown error into a message for the person who triggered it.
 *
 * Known domain errors get their own text because it is genuinely useful ("a
 * slot cannot move from live to available"). Everything else gets a flat
 * message and a server-side log: an unexpected error's text may contain column
 * names, query fragments or ids, none of which belong on a screen.
 */
export function toActionError(scope: string, error: unknown): ActionState {
  if (error instanceof IllegalTransitionError) return fail(error.message);
  if (error instanceof ForbiddenTransitionError) return fail(error.message);
  if (error instanceof NotAuthorisedError) return fail(error.message);
  if (error instanceof StaleWriteError) return fail(error.message);
  if (error instanceof PreconditionError) return fail(error.message);

  console.error(`[physical-wall] ${scope}`, error);
  return fail("That didn't work. The error has been logged.");
}

/**
 * Someone else changed the row since this page was loaded.
 *
 * Distinct from a validation failure: the request was well-formed and the user
 * did nothing wrong, so the message says to reload rather than to fix anything.
 */
export class StaleWriteError extends Error {
  readonly status = 409;
  constructor(message = "Someone else changed this first. Reload and try again.") {
    super(message);
    this.name = "StaleWriteError";
  }
}

/** A business rule said no, and the reason is safe to show. */
export class PreconditionError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "PreconditionError";
  }
}

/** Cache tags. Invalidated whenever the thing they name changes. */
export const WALL_TAG = "physical-wall";
export const CATALOG_TAG = "physical-wall-catalog";
export const LEDGER_TAG = "physical-wall-ledger";

/** Today, and a date N days on, as YYYY-MM-DD in IST. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * First zod issue as a sentence.
 *
 * One message rather than a list: these forms are short, the first problem is
 * almost always the real one, and a wall of red is not more helpful.
 */
export function firstIssue(
  error: { issues: { message: string }[] },
  fallback = "Check the form and try again."
): string {
  return error.issues[0]?.message ?? fallback;
}
