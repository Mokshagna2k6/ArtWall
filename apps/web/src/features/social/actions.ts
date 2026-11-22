"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/index";
import {
  artworkComments,
  artworkLikes,
  artworkSaves,
  artworks,
  artistProfiles,
  user,
  userFollows,
} from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";
import { enforcePolicy } from "@/features/orders/rate-limit";
import {
  attempt,
  newId,
  parseInput,
  PreconditionError,
  readSafely,
  type Result,
} from "@/features/physical-wall/actions/shared";

/**
 * The social layer (likes, comments, follows, saves).
 *
 * Follows the project's standard action contract: parseInput -> attempt ->
 * Result<T>, per features/physical-wall/actions/shared.ts. `action-contracts.test.ts`
 * scans this file statically for that shape.
 *
 * Every write resolves the actor through `getSessionUser()` — the verified-JWT
 * path (AGENTS.md), never a cookie's contents.
 */

const id = z.string().trim().min(1).max(64);

const commentSchema = z.object({
  artworkId: id,
  body: z
    .string({ error: "Write something first." })
    .trim()
    .min(1, "Write something first.")
    .max(2000, "Keep a comment under 2000 characters."),
  parentId: id.nullish(),
});

async function requireActor(): Promise<string> {
  const actor = await getSessionUser();
  if (!actor) throw new PreconditionError("Sign in first.");
  return actor.id;
}

/**
 * A like is an upsert, not an insert.
 *
 * The (artwork, user) primary key makes a double-tap from two tabs a no-op
 * rather than a duplicate-key error the user would see as a failure.
 */
export async function likeArtwork(artworkId: string): Promise<Result<{ liked: boolean }>> {
  return attempt("likeArtwork", async () => {
    const input = parseInput(id, artworkId);
    const userId = await requireActor();
    await enforcePolicy("social-action", userId);

    await db
      .insert(artworkLikes)
      .values({ artworkId: input, userId })
      .onConflictDoNothing();

    revalidatePath(`/artwork/${input}`);
    return { liked: true };
  });
}

export async function unlikeArtwork(artworkId: string): Promise<Result<{ liked: boolean }>> {
  return attempt("unlikeArtwork", async () => {
    const input = parseInput(id, artworkId);
    const userId = await requireActor();
    await enforcePolicy("social-action", userId);

    await db
      .delete(artworkLikes)
      .where(and(eq(artworkLikes.artworkId, input), eq(artworkLikes.userId, userId)));

    revalidatePath(`/artwork/${input}`);
    return { liked: false };
  });
}

/**
 * Post a comment, optionally as a reply.
 *
 * A reply must belong to the same artwork as its parent. The database cannot
 * express that without a composite foreign key, so it is checked here: a
 * cross-artwork reply would render under the wrong work and is always a bug.
 */
export async function postComment(input: {
  artworkId: string;
  body: string;
  parentId?: string | null;
}): Promise<Result<{ id: string }>> {
  return attempt("postComment", async () => {
    const { artworkId, body, parentId } = parseInput(commentSchema, input);
    const userId = await requireActor();
    // Bible rule 38. Checked BEFORE any database read: an unauthenticated or
    // over-limit caller must not get to probe for which comment ids exist.
    await enforcePolicy("comment", userId);

    if (parentId) {
      const [parent] = await db
        .select({ artworkId: artworkComments.artworkId })
        .from(artworkComments)
        .where(eq(artworkComments.id, parentId))
        .limit(1);
      if (!parent) throw new PreconditionError("That comment no longer exists.");
      if (parent.artworkId !== artworkId) {
        throw new PreconditionError("That reply does not belong to this artwork.");
      }
    }

    const commentId = newId("cmt");
    await db.insert(artworkComments).values({
      id: commentId,
      artworkId,
      userId,
      parentId: parentId ?? null,
      body,
    });

    revalidatePath(`/artwork/${artworkId}`);
    return { id: commentId };
  });
}

/**
 * Soft-delete own comment.
 *
 * Soft, because a hard delete would cascade onto replies and silently remove
 * other people's words. The row keeps its place in the thread and the body is
 * hidden at read time.
 */
export async function deleteComment(commentId: string): Promise<Result<{ deleted: boolean }>> {
  return attempt("deleteComment", async () => {
    const input = parseInput(id, commentId);
    const userId = await requireActor();
    // Limited too, although it only ever deletes the caller's own comment:
    // the lookup below runs before the ownership check, so without a cap this
    // is an unmetered oracle for which comment ids exist.
    await enforcePolicy("social-action", userId);

    const [comment] = await db
      .select({
        userId: artworkComments.userId,
        artworkId: artworkComments.artworkId,
        // The artwork's owner, so they can moderate their own page.
        ownerId: artworks.userId,
      })
      .from(artworkComments)
      .innerJoin(artworks, eq(artworks.id, artworkComments.artworkId))
      .where(eq(artworkComments.id, input))
      .limit(1);
    if (!comment) throw new PreconditionError("That comment no longer exists.");

    // Two people may remove a comment: its author, and the artist whose work
    // it sits under (Bible rule 38 — community actions must be abuse-
    // controlled, and an artist cannot be made to host abuse on their own
    // page while waiting for staff). Both are soft deletes, so nothing a
    // reply depends on actually disappears.
    const isAuthor = comment.userId === userId;
    const isArtworkOwner = comment.ownerId === userId;
    if (!isAuthor && !isArtworkOwner) {
      throw new PreconditionError("You can only remove your own comment.");
    }

    await db
      .update(artworkComments)
      .set({ deletedAt: new Date() })
      .where(eq(artworkComments.id, input));

    revalidatePath(`/artwork/${comment.artworkId}`);
    return { deleted: true };
  });
}

/** Follow an artist. Self-follow is rejected by a CHECK constraint too (0075). */
export async function followUser(followeeId: string): Promise<Result<{ following: boolean }>> {
  return attempt("followUser", async () => {
    const input = parseInput(id, followeeId);
    const followerId = await requireActor();
    await enforcePolicy("social-action", followerId);
    if (input === followerId) throw new PreconditionError("You cannot follow yourself.");

    await db
      .insert(userFollows)
      .values({ followerId, followeeId: input })
      .onConflictDoNothing();

    return { following: true };
  });
}

export async function unfollowUser(followeeId: string): Promise<Result<{ following: boolean }>> {
  return attempt("unfollowUser", async () => {
    const input = parseInput(id, followeeId);
    const followerId = await requireActor();
    await enforcePolicy("social-action", followerId);

    await db
      .delete(userFollows)
      .where(and(eq(userFollows.followerId, followerId), eq(userFollows.followeeId, input)));

    return { following: false };
  });
}

/** Private bookmark. Distinct from a collection, which is titled and curated. */
export async function saveArtwork(artworkId: string): Promise<Result<{ saved: boolean }>> {
  return attempt("saveArtwork", async () => {
    const input = parseInput(id, artworkId);
    const userId = await requireActor();
    await enforcePolicy("social-action", userId);

    await db
      .insert(artworkSaves)
      .values({ artworkId: input, userId })
      .onConflictDoNothing();

    return { saved: true };
  });
}

export async function unsaveArtwork(artworkId: string): Promise<Result<{ saved: boolean }>> {
  return attempt("unsaveArtwork", async () => {
    const input = parseInput(id, artworkId);
    const userId = await requireActor();
    await enforcePolicy("social-action", userId);

    await db
      .delete(artworkSaves)
      .where(and(eq(artworkSaves.artworkId, input), eq(artworkSaves.userId, userId)));

    return { saved: false };
  });
}

export interface ArtworkSocial {
  likeCount: number;
  commentCount: number;
  viewerLiked: boolean;
  viewerSaved: boolean;
}

/**
 * Counts plus this viewer's own state, for the artwork page.
 *
 * One query for the counts and one for the viewer's rows, rather than a count
 * per row in a list: this is called once per artwork page, not per card.
 */
export async function getArtworkSocial(artworkId: string): Promise<ArtworkSocial> {
  const empty: ArtworkSocial = {
    likeCount: 0,
    commentCount: 0,
    viewerLiked: false,
    viewerSaved: false,
  };

  return readSafely("getArtworkSocial", empty, async () => {
    const input = parseInput(id, artworkId);
    const viewer = await getSessionUser();

    const [counts] = await db
      .select({
        likeCount: sql<number>`(select count(*)::int from artwork_likes where artwork_id = ${input})`,
        commentCount: sql<number>`(select count(*)::int from artwork_comments where artwork_id = ${input} and deleted_at is null)`,
      })
      .from(artworks)
      .where(eq(artworks.id, input))
      .limit(1);

    if (!counts) return empty;
    if (!viewer) {
      return { ...counts, viewerLiked: false, viewerSaved: false };
    }

    const [liked, saved] = await Promise.all([
      db
        .select({ artworkId: artworkLikes.artworkId })
        .from(artworkLikes)
        .where(and(eq(artworkLikes.artworkId, input), eq(artworkLikes.userId, viewer.id)))
        .limit(1),
      db
        .select({ artworkId: artworkSaves.artworkId })
        .from(artworkSaves)
        .where(and(eq(artworkSaves.artworkId, input), eq(artworkSaves.userId, viewer.id)))
        .limit(1),
    ]);

    return {
      ...counts,
      viewerLiked: liked.length > 0,
      viewerSaved: saved.length > 0,
    };
  });
}

export interface CommentView {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: Date;
  authorId: string;
  authorName: string;
  authorHandle: string | null;
  authorAvatarUrl: string | null;
  deleted: boolean;
}

/**
 * A thread, flat, oldest first.
 *
 * Returned flat with `parentId` intact so the component nests it — nesting in
 * SQL would need a recursive CTE for a thread that is two levels deep by
 * design. A soft-deleted comment keeps its row (replies hang off it) but its
 * body never leaves the server.
 */
export async function listComments(artworkId: string): Promise<CommentView[]> {
  return readSafely("listComments", [], async () => {
    const input = parseInput(id, artworkId);

    const rows = await db
      .select({
        id: artworkComments.id,
        parentId: artworkComments.parentId,
        body: artworkComments.body,
        createdAt: artworkComments.createdAt,
        deletedAt: artworkComments.deletedAt,
        authorId: artworkComments.userId,
        authorName: user.name,
        authorHandle: artistProfiles.handle,
        authorAvatarUrl: artistProfiles.avatarUrl,
      })
      .from(artworkComments)
      .leftJoin(user, eq(user.id, artworkComments.userId))
      .leftJoin(artistProfiles, eq(artistProfiles.userId, artworkComments.userId))
      .where(eq(artworkComments.artworkId, input))
      .orderBy(artworkComments.createdAt)
      .limit(200);

    return rows.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      // A deleted comment's text is never sent to the browser.
      body: row.deletedAt ? "" : row.body,
      createdAt: row.createdAt,
      authorId: row.authorId,
      authorName: row.authorName ?? "Someone",
      authorHandle: row.authorHandle,
      authorAvatarUrl: row.authorAvatarUrl,
      deleted: row.deletedAt !== null,
    }));
  });
}

/** Follower/following counts for a profile, plus whether the viewer follows. */
export async function getFollowState(
  profileUserId: string
): Promise<{ followers: number; following: number; viewerFollows: boolean }> {
  const empty = { followers: 0, following: 0, viewerFollows: false };

  return readSafely("getFollowState", empty, async () => {
    const input = parseInput(id, profileUserId);
    const viewer = await getSessionUser();

    const [counts] = await db
      .select({
        followers: sql<number>`(select count(*)::int from user_follows where followee_id = ${input})`,
        following: sql<number>`(select count(*)::int from user_follows where follower_id = ${input})`,
      })
      .from(user)
      .where(eq(user.id, input))
      .limit(1);

    if (!counts) return empty;
    if (!viewer) return { ...counts, viewerFollows: false };

    const follows = await db
      .select({ followeeId: userFollows.followeeId })
      .from(userFollows)
      .where(and(eq(userFollows.followerId, viewer.id), eq(userFollows.followeeId, input)))
      .limit(1);

    return { ...counts, viewerFollows: follows.length > 0 };
  });
}

/** The viewer's saved works, newest first. Private by definition. */
export async function listSavedArtworks(): Promise<
  { id: string; title: string; imageUrl: string | null }[]
> {
  return readSafely("listSavedArtworks", [], async () => {
    const viewer = await getSessionUser();
    if (!viewer) return [];

    return db
      .select({
        id: artworks.id,
        title: artworks.title,
        imageUrl: artworks.imageUrl,
      })
      .from(artworkSaves)
      .innerJoin(artworks, eq(artworks.id, artworkSaves.artworkId))
      .where(and(eq(artworkSaves.userId, viewer.id), eq(artworks.isPublic, true)))
      .orderBy(desc(artworkSaves.createdAt))
      .limit(100);
  });
}
