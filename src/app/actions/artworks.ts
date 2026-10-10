"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { expireCatalog } from "@/lib/catalog-cache";
import { isOwnAsset } from "@/lib/cloudinary";
import { db } from "@/lib/db/index";
import { artworks } from "@/lib/db/schema";
import { ARTWORK_CATEGORIES } from "@/features/marketplace/categories";
import { toPaise } from "@/features/physical-wall/money";
import { canPublishArtwork } from "@/features/policy/engine";
import { logPolicyDecision } from "@/features/policy/log";
import { assertArtworkTransition, type LifecycleStatus } from "@/features/artworks/state-machine";
import { formFail, formInvalid, type FormResult } from "@/lib/form-result";

/**
 * BE-3.03: gate every path that sets an artwork public. `canPublishArtwork`
 * only needs the two facts it was built for (title, image) — no DB read
 * inside the gate itself, per the PolicyEngine's calling convention
 * (docs/policy-engine.md). Unpublishing (isPublic -> false) is never gated;
 * there is no reason to block an artist from taking their own work down.
 */
async function assertCanPublish(
  artworkId: string,
  facts: { hasTitle: boolean; hasImage: boolean },
  actorId: string | null
) {
  const decision = canPublishArtwork(facts);
  await logPolicyDecision({
    gate: "canPublishArtwork",
    subjectType: "artwork",
    subjectId: artworkId,
    actorId,
    decision,
    inputs: facts,
  });
  if (!decision.allow) {
    throw new Error(`Not eligible to publish: ${decision.reasons.join(", ")}`);
  }
}

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null);
const artworkSchema = z.object({
  title: z.string().trim().min(1).max(160),
  year: z.coerce.number().int().min(1000).max(3000).optional(),
  medium: optionalText(120),
  description: optionalText(1800),
  dimensions: z
    .string()
    .trim()
    .max(100)
    .regex(/\d/, "Include a number, e.g. 91 x 122 cm.")
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null),
  imageUrl: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null)
    .pipe(z.string().url().nullable()),
  imagePublicId: optionalText(500),
  isPublic: z.boolean().default(true),
  status: z.enum(["available", "sold", "reserved"]).default("available"),
  category: z
    .union([z.enum(ARTWORK_CATEGORIES), z.literal("")])
    .optional()
    .transform((value) => value || null),
  /** Rupees as typed -> integer paise. Blank = price on request (null). */
  // ponytail: price_paise is int4, so ₹2 crore is the ceiling; move to bigint if that bites.
  price: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || String(value).trim() === "") return null;
      const paise = toPaise(value);
      if (paise === null || paise > 2_000_000_000) {
        ctx.addIssue({ code: "custom", message: "Enter a price between ₹0 and ₹2,00,00,000." });
        return z.NEVER;
      }
      return paise;
    }),
});
export async function getArtworks() {
  const userId = await getUserId();
  return db
    .select()
    .from(artworks)
    .where(eq(artworks.userId, userId))
    .orderBy(desc(artworks.createdAt));
}
export async function createArtwork(input: unknown): Promise<FormResult> {
  const userId = await getUserId();
  const parsed = artworkSchema.safeParse(input);
  if (!parsed.success) return formInvalid(parsed.error);
  const { price, ...data } = parsed.data;
  if (data.imageUrl && !isOwnAsset(data.imageUrl, "artwall/artwork")) {
    return formFail(
      "That artwork image could not be verified. Please upload it again.",
      "imageUrl"
    );
  }
  const artworkId = randomUUID();
  let lifecycleStatus: LifecycleStatus = "draft";
  if (data.isPublic) {
    await assertCanPublish(
      artworkId,
      { hasTitle: data.title.trim().length > 0, hasImage: Boolean(data.imageUrl) },
      userId
    );
    assertArtworkTransition("lifecycle", "draft", "published");
    lifecycleStatus = "published";
  }
  await db
    .insert(artworks)
    .values({ id: artworkId, userId, ...data, pricePaise: price, lifecycleStatus });
  expireCatalog();
  revalidatePath("/studio");
  revalidatePath("/studio/artworks");
  return { ok: true };
}
export async function setArtworkPublic(id: string, isPublic: boolean) {
  const userId = await getUserId();
  const [current] = await db
    .select({ title: artworks.title, imageUrl: artworks.imageUrl, lifecycleStatus: artworks.lifecycleStatus })
    .from(artworks)
    .where(and(eq(artworks.id, id), eq(artworks.userId, userId)));
  if (!current) throw new Error("Artwork not found");

  // BE-3.07: lifecycle is one of the four orthogonal domains (0047) — the
  // existing `isPublic` boolean this action has always written stays
  // untouched (no caller of setArtworkPublic changes), but every transition
  // it causes also goes through the lifecycle state machine so an illegal
  // move (e.g. archived -> published without going through draft) is caught
  // server-side rather than silently written.
  const currentLifecycle = current.lifecycleStatus as LifecycleStatus;
  const nextLifecycle: LifecycleStatus = isPublic ? "published" : "draft";
  if (nextLifecycle !== currentLifecycle) {
    assertArtworkTransition("lifecycle", currentLifecycle, nextLifecycle);
  }
  if (isPublic) {
    await assertCanPublish(
      id,
      { hasTitle: Boolean(current.title?.trim()), hasImage: Boolean(current.imageUrl) },
      userId
    );
  }
  const [row] = await db
    .update(artworks)
    .set({ isPublic: Boolean(isPublic), lifecycleStatus: nextLifecycle, updatedAt: new Date() })
    .where(and(eq(artworks.id, id), eq(artworks.userId, userId)))
    .returning({ id: artworks.id, isPublic: artworks.isPublic });
  if (!row) throw new Error("Artwork not found");
  expireCatalog();
  revalidatePath("/studio/artworks");
  revalidatePath("/studio/tags");
  revalidatePath(`/artwork/${id}`);
  return row;
}
export async function deleteArtwork(id: string) {
  const userId = await getUserId();
  await db
    .delete(artworks)
    .where(and(eq(artworks.id, id), eq(artworks.userId, userId)));
  expireCatalog();
  revalidatePath("/studio/artworks");
}
