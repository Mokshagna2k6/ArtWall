"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and, desc, inArray } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import { curators, curatorPicks, artworks, artistProfiles, user } from "@/lib/db/schema";
import { recordAuditIn } from "@/features/physical-wall/audit";
import { requireRole } from "@/features/physical-wall/authorize";
import { inTransaction } from "@/features/physical-wall/actions/shared";

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

function newId(prefix: string): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Buffer.from(bytes).toString("base64url")}`;
}

export async function applyCurator(input: { displayName: string; bio?: string }) {
  const userId = await getUserId();
  const id = newId("cur");
  await db.insert(curators).values({
    id,
    userId,
    displayName: input.displayName,
    bio: input.bio ?? null,
    status: "pending",
  });
  return id;
}

export async function getActiveCurators() {
  return db
    .select({
      id: curators.id,
      displayName: curators.displayName,
      bio: curators.bio,
      commissionBps: curators.commissionBps,
    })
    .from(curators)
    .where(eq(curators.status, "active"))
    .orderBy(curators.displayName);
}

export async function addCuratorPick(artworkId: string, note?: string) {
  const userId = await getUserId();
  const [curator] = await db
    .select({ id: curators.id })
    .from(curators)
    .where(and(eq(curators.userId, userId), eq(curators.status, "active")));
  if (!curator) throw new Error("Not an active curator");

  const id = newId("pick");
  await db
    .insert(curatorPicks)
    .values({ id, curatorId: curator.id, artworkId, note: note ?? null })
    .onConflictDoNothing();

  revalidatePath("/discover");
  return id;
}

export async function getCuratorPicks(curatorId: string) {
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
    .where(eq(curatorPicks.curatorId, curatorId))
    .orderBy(desc(curatorPicks.createdAt));
}

/**
 * Curator commission, fixed at approval time (BE-1.26). Interim policy: one
 * platform-wide rate from CURATOR_COMMISSION_BPS (default 1000 = 10%) until a
 * tiered commission policy exists. Stored on the curator row so a later policy
 * change never re-prices an approved curator.
 */
function curatorCommissionBps(): number {
  const raw = process.env.CURATOR_COMMISSION_BPS ?? "1000";
  const bps = Number(raw);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new Error(`CURATOR_COMMISSION_BPS must be an integer 0–10000, got "${raw}"`);
  }
  return bps;
}

/** Admin-only status change with an audit row, in one transaction. */
async function moveCurator(curatorId: string, from: string, to: string, action: string, reason: string | null) {
  const actor = await requireRole("admin");
  const commissionBps = to === "active" ? curatorCommissionBps() : null;
  const row = await inTransaction(async (client) => {
    const { rows } = await client.query<{ id: string; status: string; commission_bps: number }>(
      `update curators
       set status = $3, commission_bps = coalesce($4, commission_bps)
       where id = $1 and status = $2
       returning id, status, commission_bps`,
      [curatorId, from, to, commissionBps]
    );
    if (!rows[0]) throw new Error(`Curator not found or not ${from}.`);
    await recordAuditIn(client, {
      actor,
      action,
      subjectType: "curator",
      subjectId: curatorId,
      before: { status: from },
      after: { status: to, commissionBps: rows[0].commission_bps, reason },
    });
    return rows[0];
  });
  revalidatePath("/discover");
  return { id: row.id, status: row.status, commissionBps: row.commission_bps };
}

/** Admin: pending → active, commission fixed now (BE-1.24, BE-1.26). */
export async function approveCurator(curatorId: string) {
  return moveCurator(curatorId, "pending", "active", "curator.approved", null);
}

/** Admin: active → suspended, with a reason (BE-1.25). */
export async function suspendCurator(curatorId: string, reason: string) {
  if (!reason?.trim()) throw new Error("Give a reason for suspending this curator.");
  return moveCurator(curatorId, "active", "suspended", "curator.suspended", reason.trim());
}

/** Admin: curators awaiting a decision, plus active ones (suspendable). */
export async function getCuratorsForReview() {
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
}
