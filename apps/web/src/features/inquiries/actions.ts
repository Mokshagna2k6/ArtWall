"use server";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordDemandSignal } from "@/features/demand/signals";
import { enforcePolicy } from "@/features/orders/rate-limit";
import {
  attempt,
  newId,
  parseInput,
  PreconditionError,
  readSafely,
  type Result,
} from "@/features/physical-wall/actions/shared";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import {
  artistProfiles,
  artworks,
  contacts,
  inquiries,
  inquiryMessages,
  user as userTable,
} from "@/lib/db/schema";

/**
 * Artwork inquiries (CHANGES-PLAN §8.5).
 *
 * A signed-in visitor asks the owner of a work about it; the thread lands in
 * the owner's /studio/contacts inbox and creates (or attaches to) a contact.
 *
 * Three things here are requirements, not choices:
 *  - **Sign-in is required** (decided 2026-10-15). There is no anonymous path,
 *    so every message has an account behind it to rate-limit and block.
 *  - **The owner's email is never exposed to the sender**, and the sender's is
 *    never exposed to the owner. Nothing in this file selects `user.email`;
 *    the platform relays, and both sides only ever see a display name.
 *  - **Rate limited.** This write path notifies a real person. It uses the
 *    shared policy enforcement (features/orders/rate-limit.ts), keyed on the
 *    sender's account.
 *
 * Follows the project action contract: parseInput (zod) → attempt/readSafely →
 * Result<T>. `action-contracts.test.ts` scans this file for that shape.
 */

const id = z.string().trim().min(1).max(64);

/** The compose box's own limit, enforced again by a CHECK in migration 0069. */
const BODY_MAX = 2000;

const createSchema = z.object({
  artworkId: id,
  body: z
    .string()
    .trim()
    .min(1, "Write a message before sending.")
    .max(BODY_MAX, `Keep the message under ${BODY_MAX} characters.`),
});

const replySchema = z.object({
  inquiryId: id,
  body: z
    .string()
    .trim()
    .min(1, "Write a message before sending.")
    .max(BODY_MAX, `Keep the message under ${BODY_MAX} characters.`),
});

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new PreconditionError("Sign in to send a message.");
  return session.user;
}

/**
 * Send an inquiry about an artwork, or add to the thread if this sender has
 * already written to this owner about this work.
 *
 * One thread per (artwork, sender) pair rather than one per message: a
 * follow-up question belongs in the conversation it continues, and it keeps a
 * determined sender from filling an owner's inbox with separate rows.
 */
export async function createInquiry(
  raw: z.input<typeof createSchema>
): Promise<Result<{ inquiryId: string }>> {
  return attempt("createInquiry", async () => {
    const input = parseInput(createSchema, raw);
    const sender = await requireUser();
    // Before any write: this notifies a real person.
    await enforcePolicy("inquiry", sender.id);

    const [work] = await db
      .select({
        id: artworks.id,
        title: artworks.title,
        ownerId: artworks.userId,
        isPublic: artworks.isPublic,
        ownerPublished: artistProfiles.published,
      })
      .from(artworks)
      .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
      .where(eq(artworks.id, input.artworkId))
      .limit(1);

    // Same visibility rule as the public artwork page: you cannot inquire
    // about something you could not have seen.
    if (!work || !work.isPublic || !work.ownerPublished) {
      throw new PreconditionError("That work is not available to inquire about.");
    }
    if (work.ownerId === sender.id) {
      throw new PreconditionError("This is your own work.");
    }

    const [existing] = await db
      .select({ id: inquiries.id })
      .from(inquiries)
      .where(and(eq(inquiries.artworkId, work.id), eq(inquiries.senderId, sender.id)))
      .limit(1);

    const inquiryId = existing?.id ?? newId("inq");
    const now = new Date();

    if (!existing) {
      await db.insert(inquiries).values({
        id: inquiryId,
        artworkId: work.id,
        senderId: sender.id,
        recipientId: work.ownerId,
        subject: work.title,
        lastMessageAt: now,
      });
    } else {
      // A new message makes the thread unread for the recipient again.
      await db
        .update(inquiries)
        .set({ lastMessageAt: now, readAt: null, status: "open" })
        .where(eq(inquiries.id, inquiryId));
    }

    await db.insert(inquiryMessages).values({
      id: newId("imsg"),
      inquiryId,
      authorId: sender.id,
      body: input.body,
    });

    await attachContact(work.ownerId, sender.id, sender.name, inquiryId);

    // Bible §14 (CHANGES-PLAN §22.3): an inquiry is a weighted demand signal
    // ("purchase intent", MEDIUM), not only a message. Without this the demand
    // engine never sees purchase intent at all. Never throws — see signals.ts.
    await recordDemandSignal(work.id, "inquiry");

    revalidatePath("/studio/contacts");
    return { inquiryId };
  });
}

/**
 * Create the owner's contact for this sender, or leave the existing one alone.
 *
 * `onConflictDoNothing` on the (userId, source_user_id) unique index from 0069:
 * a repeat inquiry must not duplicate the contact, and must not overwrite a
 * name the owner has since edited themselves.
 *
 * No email is copied onto the contact. The owner reaches this person through
 * the thread, which is the whole point of relaying.
 */
async function attachContact(
  ownerId: string,
  senderId: string,
  senderName: string,
  inquiryId: string
) {
  await db
    .insert(contacts)
    .values({
      id: newId("con"),
      userId: ownerId,
      name: senderName,
      kind: "collector",
      sourceUserId: senderId,
      sourceInquiryId: inquiryId,
    })
    .onConflictDoNothing();
}

/** Add a message to a thread. Either participant may reply. */
export async function replyToInquiry(
  raw: z.input<typeof replySchema>
): Promise<Result<null>> {
  return attempt("replyToInquiry", async () => {
    const input = parseInput(replySchema, raw);
    const me = await requireUser();
    await enforcePolicy("inquiry", me.id);

    const [thread] = await db
      .select({
        id: inquiries.id,
        senderId: inquiries.senderId,
        recipientId: inquiries.recipientId,
      })
      .from(inquiries)
      .where(eq(inquiries.id, input.inquiryId))
      .limit(1);

    // Same message for "no such thread" and "not yours": a stranger must not
    // be able to probe which inquiry ids exist.
    if (!thread || (thread.senderId !== me.id && thread.recipientId !== me.id)) {
      throw new PreconditionError("That conversation is not available.");
    }

    await db.insert(inquiryMessages).values({
      id: newId("imsg"),
      inquiryId: thread.id,
      authorId: me.id,
      body: input.body,
    });

    const fromOwner = thread.recipientId === me.id;
    await db
      .update(inquiries)
      .set({
        lastMessageAt: new Date(),
        // The owner replying marks the thread replied; the sender writing
        // again makes it unread for the owner.
        ...(fromOwner
          ? { status: "replied", repliedAt: new Date() }
          : { readAt: null, status: "open" }),
      })
      .where(eq(inquiries.id, thread.id));

    revalidatePath("/studio/contacts");
    return null;
  });
}

/** Mark a thread read. Only the recipient's reading counts. */
export async function markInquiryRead(rawId: string): Promise<Result<null>> {
  return attempt("markInquiryRead", async () => {
    const inquiryId = parseInput(id, rawId);
    const me = await requireUser();
    await db
      .update(inquiries)
      .set({ readAt: new Date() })
      .where(and(eq(inquiries.id, inquiryId), eq(inquiries.recipientId, me.id)));
    revalidatePath("/studio/contacts");
    return null;
  });
}

export interface InquiryThread {
  id: string;
  artworkId: string;
  artworkTitle: string;
  artworkImage: string | null;
  /** The other participant's display name. Never their email. */
  counterpartName: string;
  /** True when the signed-in user received this inquiry rather than sent it. */
  incoming: boolean;
  status: string;
  unread: boolean;
  lastMessageAt: Date;
  messageCount: number;
}

/**
 * Threads for the signed-in user's inbox: received first, then sent, newest
 * first. Read-only, so a failure renders an empty inbox rather than throwing.
 */
export async function getMyInquiries(): Promise<InquiryThread[]> {
  return readSafely("getMyInquiries", [], async () => {
    const me = await requireUser();
    const rows = await db
      .select({
        id: inquiries.id,
        artworkId: inquiries.artworkId,
        artworkTitle: artworks.title,
        artworkImage: artworks.imageUrl,
        senderId: inquiries.senderId,
        recipientId: inquiries.recipientId,
        senderName: userTable.name,
        status: inquiries.status,
        readAt: inquiries.readAt,
        lastMessageAt: inquiries.lastMessageAt,
        messageCount: sql<number>`(select count(*) from ${inquiryMessages} where ${inquiryMessages.inquiryId} = ${inquiries.id})`,
      })
      .from(inquiries)
      .innerJoin(artworks, eq(inquiries.artworkId, artworks.id))
      .innerJoin(userTable, eq(inquiries.senderId, userTable.id))
      .where(sql`${inquiries.recipientId} = ${me.id} or ${inquiries.senderId} = ${me.id}`)
      .orderBy(desc(inquiries.lastMessageAt))
      .limit(200);

    // The counterpart's name: for a received thread it is the sender (already
    // joined); for a sent one it is the artwork's owner, whose public display
    // name is the artist profile's. Resolved with one extra query rather than
    // a second join on the same table.
    const sentOwnerIds = [...new Set(rows.filter((r) => r.senderId === me.id).map((r) => r.recipientId))];
    const ownerNames = new Map<string, string>();
    if (sentOwnerIds.length > 0) {
      const owners = await db
        .select({ userId: artistProfiles.userId, displayName: artistProfiles.displayName })
        .from(artistProfiles)
        .where(sql`${artistProfiles.userId} in ${sentOwnerIds}`);
      for (const owner of owners) ownerNames.set(owner.userId, owner.displayName);
    }

    return rows.map((row) => {
      const incoming = row.recipientId === me.id;
      return {
        id: row.id,
        artworkId: row.artworkId,
        artworkTitle: row.artworkTitle,
        artworkImage: row.artworkImage,
        counterpartName: incoming
          ? row.senderName
          : (ownerNames.get(row.recipientId) ?? "The owner"),
        incoming,
        status: row.status,
        unread: incoming && row.readAt === null,
        lastMessageAt: row.lastMessageAt,
        messageCount: Number(row.messageCount),
      };
    });
  });
}

export interface InquiryMessageView {
  id: string;
  body: string;
  mine: boolean;
  authorName: string;
  createdAt: Date;
}

/** One thread's messages, oldest first. Empty unless the viewer is a participant. */
export async function getInquiryThread(rawId: string): Promise<InquiryMessageView[]> {
  return readSafely("getInquiryThread", [], async () => {
    const inquiryId = parseInput(id, rawId);
    const me = await requireUser();

    const [thread] = await db
      .select({ senderId: inquiries.senderId, recipientId: inquiries.recipientId })
      .from(inquiries)
      .where(eq(inquiries.id, inquiryId))
      .limit(1);
    if (!thread || (thread.senderId !== me.id && thread.recipientId !== me.id)) return [];

    const rows = await db
      .select({
        id: inquiryMessages.id,
        body: inquiryMessages.body,
        authorId: inquiryMessages.authorId,
        authorName: userTable.name,
        createdAt: inquiryMessages.createdAt,
      })
      .from(inquiryMessages)
      .innerJoin(userTable, eq(inquiryMessages.authorId, userTable.id))
      .where(eq(inquiryMessages.inquiryId, inquiryId))
      .orderBy(asc(inquiryMessages.createdAt))
      .limit(500);

    return rows.map((row) => ({
      id: row.id,
      body: row.body,
      mine: row.authorId === me.id,
      authorName: row.authorName,
      createdAt: row.createdAt,
    }));
  });
}

/** Count for the inbox badge: threads addressed to me and not yet read. */
export async function getUnreadInquiryCount(): Promise<number> {
  return readSafely("getUnreadInquiryCount", 0, async () => {
    const me = await requireUser();
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inquiries)
      .where(and(eq(inquiries.recipientId, me.id), isNull(inquiries.readAt)));
    return Number(row?.count ?? 0);
  });
}
