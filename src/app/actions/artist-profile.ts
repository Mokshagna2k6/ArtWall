"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { ensureArtistProfile } from "@/lib/artist-profiles";
import { expireCatalog } from "@/lib/catalog-cache";
import { isOwnAsset } from "@/lib/cloudinary";
import { db } from "@/lib/db/index";
import { artistProfiles } from "@/lib/db/schema";
import { formFail, formInvalid, type FormResult } from "@/lib/form-result";

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens only."
    )
    .min(3)
    .max(60),
  discipline: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(120),
  bio: z
    .string()
    .trim()
    .min(40, "Tell visitors a little more about your practice.")
    .max(1_800),
  website: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .pipe(z.string().url().max(300).optional())
    .transform((value) => value || null),
  instagram: z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, ""))
    .pipe(
      z
        .string()
        .regex(
          /^[a-zA-Z0-9._]*$/,
          "Enter an Instagram username, without a URL."
        )
        .max(30)
    )
    .transform((value) => value || null),
  avatarUrl: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null)
    .pipe(z.string().url().max(1_000).nullable()),
});

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user;
}

export async function getStudioArtistProfile() {
  return ensureArtistProfile(await currentUser());
}

export async function saveArtistProfile(input: unknown): Promise<FormResult> {
  const user = await currentUser();
  const current = await ensureArtistProfile(user);
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return formInvalid(parsed.error);
  const data = parsed.data;

  if (data.avatarUrl && !isOwnAsset(data.avatarUrl, "artwall/selfie")) {
    return formFail(
      "That profile image could not be verified. Please upload it again.",
      "avatarUrl"
    );
  }

  if (data.handle !== current.handle) {
    const owner = await db
      .select({ userId: artistProfiles.userId })
      .from(artistProfiles)
      .where(eq(artistProfiles.handle, data.handle))
      .limit(1);
    if (owner[0] && owner[0].userId !== user.id) {
      return formFail("That ArtWall handle is already taken.", "handle");
    }
  }

  await db
    .update(artistProfiles)
    .set({
      ...data,
      onboardingCompleted: true,
      updatedAt: new Date(),
    })
    .where(eq(artistProfiles.userId, user.id));

  revalidatePath("/studio");
  revalidatePath("/studio/settings");
  expireCatalog();
  revalidatePath("/artists");
  revalidatePath(`/artist/${current.handle}`);
  revalidatePath(`/artist/${data.handle}`);
  return { ok: true };
}

export async function publishArtistProfile() {
  const user = await currentUser();
  const profile = await ensureArtistProfile(user);
  if (!profile.onboardingCompleted) {
    throw new Error(
      "Complete your artist profile before publishing it to ArtWall."
    );
  }

  await db
    .update(artistProfiles)
    .set({ published: true, publishedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(artistProfiles.userId, user.id),
        eq(artistProfiles.onboardingCompleted, true)
      )
    );

  revalidatePath("/studio");
  revalidatePath("/studio/settings");
  expireCatalog();
  revalidatePath("/artists");
  revalidatePath(`/artist/${profile.handle}`);
}

export async function unpublishArtistProfile() {
  const user = await currentUser();
  const profile = await ensureArtistProfile(user);
  await db
    .update(artistProfiles)
    .set({ published: false, publishedAt: null, updatedAt: new Date() })
    .where(eq(artistProfiles.userId, user.id));
  revalidatePath("/studio");
  revalidatePath("/studio/settings");
  expireCatalog();
  revalidatePath("/artists");
  revalidatePath(`/artist/${profile.handle}`);
}
