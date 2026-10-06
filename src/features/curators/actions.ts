"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and, desc, inArray } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import { curators, curatorPicks, artworks, artistProfiles, user } from "@/lib/db/schema";
import { recordAuditIn } from "@/features/physical-wall/audit";
import { requireAdminRole, requireRole } from "@/features/physical-wall/authorize";
import { getActiveCommissionPolicy } from "@/features/policy/commission";
import {
  attempt,
  inTransaction,
  parseInput,
  PreconditionError,
  readSafely,
  type Result,
} from "@/features/physical-wall/actions/shared";

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new PreconditionError("Sign in first.");
  return session.user.id;
}

function newId(prefix: string): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Buffer.from(bytes).toString("base64url")}`;
}

const id = z.string().trim().min(1).max(64);
const applySchema = z.object({
  displayName: z.string({ error: "Give a display name." }).trim().min(2, "Give a display name.").max(120),
  bio: z.string().trim().max(2000).optional(),
});

export async function applyCurator(raw: z.input<typeof applySchema>): Promise<Result<string>> {
  return attempt("applyCurator", async () => {
    const input = parseInput(applySchema, raw);
    const userId = await getUserId();
    const curatorId = newId("cur");
    await db.insert(curators).values({
      id: curatorId,
      userId,
      displayName: input.displayName,
      bio: input.bio ?? null,
      status: "pending",
    });
    return curatorId;
  });
}

export async function getActiveCurators() {
  return readSafely("getActiveCurators", [], () =>
    db
      .select({
        id: curators.id,
        displayName: curators.displayName,
        bio: curators.bio,
        commissionBps: curators.commissionBps,
      })
      .from(curators)
      .where(eq(curators.status, "active"))
      .orderBy(curators.displayName)
  );
}

export async function addCuratorPick(artworkId: string, note?: string): Promise<Result<string>> {
  return attempt("addCuratorPick", async () => {
    const input = parseInput(z.object({ artworkId: id, note: z.string().trim().max(500).optional() }), {
      artworkId,
      note,
    });
    const userId = await getUserId();
    const [curator] = await db
      .select({ id: curators.id })
      .from(curators)
      .where(and(eq(curators.userId, userId), eq(curators.status, "active")));
    if (!curator) throw new PreconditionError("Not an active curator");

    const pickId = newId("pick");
    await db
      .insert(curatorPicks)
      .values({ id: pickId, curatorId: curator.id, artworkId: input.artworkId, note: input.note ?? null })
      .onConflictDoNothing();

    revalidatePath("/discover");
    return pickId;
  });
}

export async function getCuratorPicks(curatorId: string) {
  return readSafely("getCuratorPicks", [], async () => {
    const cid = parseInput(id, curatorId);
    return db
      .select({
        id: curatorPicks.id,
        note: curatorPicks.note,
        artworkId: artworks.id,
        artworkTitle: artworks.title,
        artworkImage: artworks.imageUrl,
        artistName: artistProfiles.displayName,
      })
      .from(curatorPicks)
      .innerJoin(artworks, eq(curatorPicks.artworkId, artworks.id))
      .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
      .where(eq(curatorPicks.curatorId, cid))
      .orderBy(desc(curatorPicks.createdAt));
  });
}

type CuratorState = { id: string; status: string; commissionBps: number; unchanged: boolean };

/**
 * Admin-only status change with an audit row, in one transaction.
 *
 * Idempotent (BE-2.19): if the curator is already in the target state (a
 * double click, two admins at once, a retried request) nothing is written —
 * no second audit row — and the current state comes back with unchanged: true.
 * Two concurrent approvals serialise on the row lock: the second update finds
 * no 'pending' row and reads the committed 'active' one.
 */
async function moveCurator(curatorId: string, from: string, to: string, action: string, reason: string | null) {
  // SEC-3.02: curator approve/suspend maps directly onto the Bible's
  // curator_admin role ("Curation and exhibition approvals" per
  // admin_roles.description) — the other proof point for the new
  // granular-role system, alongside identity review's compliance_admin.
  const actor = await requireAdminRole("curator_admin");
  const commissionBps =
    to === "active" ? (await getActiveCommissionPolicy("curator_commission")).rateBps : null;
  const row = await inTransaction(async (client): Promise<CuratorState> => {
    const { rows } = await client.query<{ id: string; status: string; commission_bps: number }>(
      `update curators
       set status = $3, commission_bps = coalesce($4, commission_bps)
       where id = $1 and status = $2
       returning id, status, commission_bps`,
      [curatorId, from, to, commissionBps]
    );
    if (!rows[0]) {
      const current = await client.query<{ id: string; status: string; commission_bps: number }>(
        `select id, status, commission_bps from curators where id = $1`,
        [curatorId]
      );
      const cur = current.rows[0];
      if (cur?.status === to) {
        return { id: cur.id, status: cur.status, commissionBps: cur.commission_bps, unchanged: true };
      }
      throw new PreconditionError(cur ? `This curator is ${cur.status}, not ${from}.` : "Curator not found.");
    }
    await recordAuditIn(client, {
      actor,
      action,
      subjectType: "curator",
      subjectId: curatorId,
      before: { status: from },
      after: { status: to, commissionBps: rows[0].commission_bps, reason },
    });
    return { id: rows[0].id, status: rows[0].status, commissionBps: rows[0].commission_bps, unchanged: false };
  });
  if (!row.unchanged) revalidatePath("/discover");
  return row;
}

/** Admin: pending → active, commission fixed now (BE-1.24, BE-1.26). Approving an active curator is a no-op. */
export async function approveCurator(curatorId: string): Promise<Result<CuratorState>> {
  return attempt("approveCurator", async () =>
    moveCurator(parseInput(id, curatorId), "pending", "active", "curator.approved", null)
  );
}

/** Admin: active → suspended, with a reason (BE-1.25). */
export async function suspendCurator(curatorId: string, reason: string): Promise<Result<CuratorState>> {
  return attempt("suspendCurator", async () => {
    const input = parseInput(
      z.object({
        curatorId: id,
        reason: z.string({ error: "Give a reason for suspending this curator." }).trim().min(1, "Give a reason for suspending this curator.").max(500),
      }),
      { curatorId, reason }
    );
    return moveCurator(input.curatorId, "active", "suspended", "curator.suspended", input.reason);
  });
}

/** Admin: curators awaiting a decision, plus active ones (suspendable). */
export async function getCuratorsForReview() {
  return readSafely("getCuratorsForReview", [], async () => {
    await requireRole("admin");
    return db
      .select({
        id: curators.id,
        displayName: curators.displayName,
        bio: curators.bio,
        status: curators.status,
        commissionBps: curators.commissionBps,
        createdAt: curators.createdAt,
        email: user.email,
      })
      .from(curators)
      .innerJoin(user, eq(curators.userId, user.id))
      .where(inArray(curators.status, ["pending", "active"]))
      .orderBy(curators.status, desc(curators.createdAt));
  });
}
