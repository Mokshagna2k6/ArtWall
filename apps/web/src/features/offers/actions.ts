"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/index";
import { artworkOffers, artworks } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";
import { enforcePolicy } from "@/features/orders/rate-limit";
import { notifyUser } from "@/features/physical-wall/notifications";
import {
  attempt,
  newId,
  parseInput,
  PreconditionError,
  readSafely,
  type Result,
} from "@/features/physical-wall/actions/shared";
import {
  MAX_COUNTER_ROUNDS,
  minimumOfferPaise,
  nextCounterRound,
  NO_DEMAND,
  offerExpiry,
  VALIDITY_DAYS,
  type DemandSignal,
  type ValidityDays,
} from "@/features/offers/rules";

/**
 * Offers (Bible §17 Part 1).
 *
 * Standard action contract — parseInput -> attempt/readSafely -> Result<T>,
 * per features/physical-wall/actions/shared.ts. Every write resolves the actor
 * through `getSessionUser()`, the verified-JWT path.
 *
 * The three rules that matter are all enforced here AND as CHECK constraints
 * in migration 0085: minimum 50% of the asking price, 7/14/30-day validity,
 * and at most two counter rounds. The application checks them so the user gets
 * a sentence instead of a constraint violation; the database checks them so a
 * future caller cannot skip the sentence.
 */

const id = z.string().trim().min(1).max(64);

const makeOfferSchema = z.object({
  artworkId: id,
  amountPaise: z
    .number({ error: "Enter an amount." })
    .int("Enter a whole number of paise.")
    .positive("Enter an amount."),
  validityDays: z.union(
    VALIDITY_DAYS.map((d) => z.literal(d)) as [
      z.ZodLiteral<7>,
      z.ZodLiteral<14>,
      z.ZodLiteral<30>,
    ],
    { error: "Choose 7, 14 or 30 days." }
  ),
  message: z.string().trim().max(1000, "Keep the note under 1000 characters.").optional(),
});

const respondSchema = z.object({
  threadId: id,
  /** A counter needs an amount; accept and decline do not. */
  amountPaise: z.number().int().positive().optional(),
  message: z.string().trim().max(1000, "Keep the note under 1000 characters.").optional(),
});

async function requireActor(): Promise<string> {
  const actor = await getSessionUser();
  if (!actor) throw new PreconditionError("Sign in first.");
  return actor.id;
}

/** The head row (round 0) of a thread, which carries the thread's status. */
async function loadThread(threadId: string) {
  const rows = await db
    .select()
    .from(artworkOffers)
    .where(eq(artworkOffers.threadId, threadId))
    .orderBy(desc(artworkOffers.round));
  const head = rows.find((row) => row.round === 0);
  if (!head) throw new PreconditionError("That offer no longer exists.");
  return { head, latest: rows[0], counters: rows.filter((r) => r.kind === "counter").length };
}

/**
 * A buyer's opening offer.
 *
 * The asking price is read from the artwork and snapshotted on the row: the
 * 50% floor has to be judged against the price that was on the page, and an
 * accepted offer's audit trail needs to show what was being discounted.
 */
export async function makeOffer(input: {
  artworkId: string;
  amountPaise: number;
  validityDays: ValidityDays;
  message?: string;
}): Promise<Result<{ threadId: string }>> {
  return attempt("makeOffer", async () => {
    const parsed = parseInput(makeOfferSchema, input);
    const buyerId = await requireActor();
    // Before any read: an over-limit caller must not get to probe prices.
    await enforcePolicy("social-action", buyerId);

    const [work] = await db
      .select({
        ownerId: artworks.userId,
        pricePaise: artworks.pricePaise,
        commerceStatus: artworks.commerceStatus,
        isPublic: artworks.isPublic,
      })
      .from(artworks)
      .where(eq(artworks.id, parsed.artworkId))
      .limit(1);

    if (!work || !work.isPublic) throw new PreconditionError("That artwork is not available.");
    if (work.ownerId === buyerId) throw new PreconditionError("You cannot offer on your own work.");
    if (work.pricePaise == null || work.pricePaise <= 0) {
      throw new PreconditionError("This work has no asking price, so it cannot take offers.");
    }

    const floor = minimumOfferPaise(work.pricePaise);
    if (parsed.amountPaise < floor) {
      throw new PreconditionError(
        `Offers must be at least 50% of the asking price (₹${Math.round(floor / 100).toLocaleString("en-IN")}).`
      );
    }

    // One live negotiation per buyer per work: a second opening offer while
    // the first is still pending is a retry, not a new conversation.
    const live = await db
      .select({ threadId: artworkOffers.threadId })
      .from(artworkOffers)
      .where(
        and(
          eq(artworkOffers.artworkId, parsed.artworkId),
          eq(artworkOffers.buyerId, buyerId),
          eq(artworkOffers.round, 0),
          eq(artworkOffers.status, "pending")
        )
      )
      .limit(1);
    if (live.length > 0) {
      throw new PreconditionError("You already have an offer open on this work.");
    }

    const threadId = newId("ofr");
    await db.insert(artworkOffers).values({
      id: threadId,
      threadId,
      artworkId: parsed.artworkId,
      buyerId,
      sellerId: work.ownerId,
      kind: "offer",
      round: 0,
      authorSide: "buyer",
      offerAmountPaise: parsed.amountPaise,
      askingPricePaise: work.pricePaise,
      message: parsed.message ?? null,
      status: "pending",
      expiresAt: offerExpiry(parsed.validityDays),
    });

    // The artist is told an offer arrived. `system.notice` rather than a new
    // template kind: TEMPLATES is a shared closed union owned by another
    // feature, and the message carries no structure a template would add.
    // shortcut: generic template; give offers their own kinds when the offer
    // emails need branding or a deep link.
    await notifyUser("system.notice", work.ownerId, () => ({
      subject: "You have a new offer",
      body: "Someone has made an offer on one of your works. Open your offers page to accept, decline or counter it.",
    }));

    revalidatePath(`/artwork/${parsed.artworkId}`);
    return { threadId };
  });
}

/** The artist accepts. The thread closes and checkout takes over (§17). */
export async function acceptOffer(threadId: string): Promise<Result<{ amountPaise: number }>> {
  return attempt("acceptOffer", async () => {
    const parsed = parseInput(id, threadId);
    const actorId = await requireActor();
    await enforcePolicy("social-action", actorId);

    const { head, latest } = await loadThread(parsed);
    if (head.status !== "pending") throw new PreconditionError("This offer is already closed.");
    if (head.expiresAt.getTime() <= Date.now()) {
      throw new PreconditionError("This offer has expired.");
    }
    // Whoever did NOT write the live message is the one who can accept it.
    const accepterSide = latest.authorSide === "buyer" ? "seller" : "buyer";
    const expected = accepterSide === "seller" ? head.sellerId : head.buyerId;
    if (actorId !== expected) throw new PreconditionError("This offer is not yours to answer.");

    await db
      .update(artworkOffers)
      .set({ status: "accepted", respondedAt: new Date() })
      .where(and(eq(artworkOffers.threadId, parsed), eq(artworkOffers.round, 0)));

    await notifyUser("system.notice", head.buyerId, () => ({
      subject: "Your offer was accepted",
      body: "An artist has accepted your offer. Complete checkout from your offers page to secure the work.",
    }));

    revalidatePath(`/artwork/${head.artworkId}`);
    // The agreed price. Checkout reads it from the accepted thread rather than
    // from the artwork's list price.
    return { amountPaise: latest.offerAmountPaise };
  });
}

/** The artist declines. The thread closes; no counter is possible afterwards. */
export async function declineOffer(threadId: string): Promise<Result<{ closed: true }>> {
  return attempt("declineOffer", async () => {
    const parsed = parseInput(id, threadId);
    const actorId = await requireActor();
    await enforcePolicy("social-action", actorId);

    const { head, latest } = await loadThread(parsed);
    if (head.status !== "pending") throw new PreconditionError("This offer is already closed.");
    const declinerSide = latest.authorSide === "buyer" ? "seller" : "buyer";
    const expected = declinerSide === "seller" ? head.sellerId : head.buyerId;
    if (actorId !== expected) throw new PreconditionError("This offer is not yours to answer.");

    await db
      .update(artworkOffers)
      .set({ status: "declined", respondedAt: new Date() })
      .where(and(eq(artworkOffers.threadId, parsed), eq(artworkOffers.round, 0)));

    revalidatePath(`/artwork/${head.artworkId}`);
    return { closed: true as const };
  });
}

/**
 * Counter the live message. §17: at most two counter rounds per thread.
 *
 * When both counters are spent the thread EXPIRES rather than silently
 * refusing — the Bible says the thread expires, and leaving it 'pending' would
 * let it sit in both inboxes forever with no legal move.
 */
export async function counterOffer(input: {
  threadId: string;
  amountPaise: number;
  message?: string;
}): Promise<Result<{ round: number }>> {
  return attempt("counterOffer", async () => {
    const parsed = parseInput(respondSchema, input);
    const actorId = await requireActor();
    await enforcePolicy("social-action", actorId);

    if (parsed.amountPaise == null) throw new PreconditionError("Enter a counter amount.");

    const { head, latest, counters } = await loadThread(parsed.threadId);
    if (head.status !== "pending") throw new PreconditionError("This offer is already closed.");
    if (head.expiresAt.getTime() <= Date.now()) {
      throw new PreconditionError("This offer has expired.");
    }

    // Only the side that did not write the live message may answer it.
    const side = latest.authorSide === "buyer" ? "seller" : "buyer";
    const expected = side === "seller" ? head.sellerId : head.buyerId;
    if (actorId !== expected) throw new PreconditionError("This offer is not yours to answer.");

    if (counters >= MAX_COUNTER_ROUNDS || nextCounterRound(latest.round) === null) {
      // Both counters used. Close the thread rather than leave a dead pending.
      await db
        .update(artworkOffers)
        .set({ status: "expired", respondedAt: new Date() })
        .where(and(eq(artworkOffers.threadId, parsed.threadId), eq(artworkOffers.round, 0)));
      revalidatePath(`/artwork/${head.artworkId}`);
      throw new PreconditionError(
        "This negotiation has used both counter-offers, so it has now closed."
      );
    }

    // The 50% floor applies to every message in the thread, not only the
    // opening one — otherwise a counter could undercut the rule the opening
    // offer had to clear.
    const floor = minimumOfferPaise(head.askingPricePaise);
    if (parsed.amountPaise < floor) {
      throw new PreconditionError("A counter must also be at least 50% of the asking price.");
    }

    const round = nextCounterRound(latest.round)!;
    await db.insert(artworkOffers).values({
      id: newId("ofr"),
      threadId: parsed.threadId,
      artworkId: head.artworkId,
      buyerId: head.buyerId,
      sellerId: head.sellerId,
      kind: "counter",
      round,
      authorSide: side,
      offerAmountPaise: parsed.amountPaise,
      askingPricePaise: head.askingPricePaise,
      message: parsed.message ?? null,
      // Only the head carries live status; a reply is never the live state.
      status: "superseded",
      expiresAt: head.expiresAt,
    });

    revalidatePath(`/artwork/${head.artworkId}`);
    return { round };
  });
}

/**
 * The PUBLIC demand-supply signal (§17), and nothing else.
 *
 * §44 / rule 40: a buyer's identity and their exact individual offer never
 * leave the server. This returns a count, a min, a max and a recency — all
 * aggregates. The select list has no buyer_id in it, so there is no version of
 * this function that leaks one by accident.
 *
 * Expired and withdrawn threads still count as demand: they happened. Only the
 * opening offers (round 0) are counted, so a long negotiation is one signal
 * rather than three.
 */
export async function getDemandSignal(artworkId: string): Promise<DemandSignal> {
  return readSafely("getDemandSignal", NO_DEMAND, async () => {
    const parsed = parseInput(id, artworkId);

    const [row] = await db
      .select({
        offerCount: sql<number>`count(*)::int`,
        lowPaise: sql<number | null>`min(${artworkOffers.offerAmountPaise})::int`,
        highPaise: sql<number | null>`max(${artworkOffers.offerAmountPaise})::int`,
        latestOfferAt: sql<Date | null>`max(${artworkOffers.createdAt})`,
      })
      .from(artworkOffers)
      .where(and(eq(artworkOffers.artworkId, parsed), eq(artworkOffers.round, 0)));

    if (!row || row.offerCount === 0) return NO_DEMAND;
    return {
      offerCount: row.offerCount,
      lowPaise: row.lowPaise,
      highPaise: row.highPaise,
      latestOfferAt: row.latestOfferAt ? new Date(row.latestOfferAt) : null,
    };
  });
}

export interface OfferThreadView {
  threadId: string;
  artworkId: string;
  artworkTitle: string;
  status: string;
  expiresAt: Date;
  /** Oldest first, so the thread reads top to bottom. */
  messages: {
    round: number;
    authorSide: string;
    amountPaise: number;
    message: string | null;
    createdAt: Date;
  }[];
  countersUsed: number;
  countersLeft: number;
  /** Whether it is this viewer's turn, and as which side. */
  viewerSide: "buyer" | "seller" | null;
  viewerCanRespond: boolean;
}

/**
 * The viewer's own offer threads — as buyer or as artist.
 *
 * PRIVATE by construction: the where clause pins both sides to the viewer's
 * own id, so there is no argument that makes this return someone else's
 * negotiation. Buyer identity still is not included; the artist sees their
 * counterpart through the order once an offer is accepted, not here.
 */
export async function listMyOfferThreads(): Promise<OfferThreadView[]> {
  return readSafely("listMyOfferThreads", [], async () => {
    const viewer = await getSessionUser();
    if (!viewer) return [];

    const rows = await db
      .select({
        threadId: artworkOffers.threadId,
        artworkId: artworkOffers.artworkId,
        artworkTitle: artworks.title,
        buyerId: artworkOffers.buyerId,
        sellerId: artworkOffers.sellerId,
        kind: artworkOffers.kind,
        round: artworkOffers.round,
        authorSide: artworkOffers.authorSide,
        amountPaise: artworkOffers.offerAmountPaise,
        message: artworkOffers.message,
        status: artworkOffers.status,
        expiresAt: artworkOffers.expiresAt,
        createdAt: artworkOffers.createdAt,
      })
      .from(artworkOffers)
      .innerJoin(artworks, eq(artworks.id, artworkOffers.artworkId))
      .where(
        sql`(${artworkOffers.buyerId} = ${viewer.id} or ${artworkOffers.sellerId} = ${viewer.id})`
      )
      .orderBy(desc(artworkOffers.createdAt))
      .limit(200);

    const threads = new Map<string, OfferThreadView & { head: (typeof rows)[number] | null }>();
    for (const row of rows) {
      let thread = threads.get(row.threadId);
      if (!thread) {
        const viewerSide =
          row.buyerId === viewer.id ? ("buyer" as const) : ("seller" as const);
        thread = {
          threadId: row.threadId,
          artworkId: row.artworkId,
          artworkTitle: row.artworkTitle,
          status: row.status,
          expiresAt: row.expiresAt,
          messages: [],
          countersUsed: 0,
          countersLeft: MAX_COUNTER_ROUNDS,
          viewerSide,
          viewerCanRespond: false,
          head: null,
        };
        threads.set(row.threadId, thread);
      }
      thread.messages.push({
        round: row.round,
        authorSide: row.authorSide,
        amountPaise: row.amountPaise,
        message: row.message,
        createdAt: row.createdAt,
      });
      if (row.kind === "counter") thread.countersUsed += 1;
      // Round 0 carries the live status and the real expiry.
      if (row.round === 0) {
        thread.head = row;
        thread.status = row.status;
        thread.expiresAt = row.expiresAt;
      }
    }

    const now = Date.now();
    return [...threads.values()].map((thread) => {
      thread.messages.sort((a, b) => a.round - b.round);
      const live = thread.messages[thread.messages.length - 1];
      const open = thread.status === "pending" && thread.expiresAt.getTime() > now;
      return {
        threadId: thread.threadId,
        artworkId: thread.artworkId,
        artworkTitle: thread.artworkTitle,
        status: thread.status,
        expiresAt: thread.expiresAt,
        messages: thread.messages,
        countersUsed: thread.countersUsed,
        countersLeft: Math.max(0, MAX_COUNTER_ROUNDS - thread.countersUsed),
        viewerSide: thread.viewerSide,
        // It is the viewer's turn when they did not write the live message.
        viewerCanRespond: open && live !== undefined && live.authorSide !== thread.viewerSide,
      };
    });
  });
}
