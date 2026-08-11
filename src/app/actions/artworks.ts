'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { isOwnAsset } from '@/lib/cloudinary';
import { db } from '@/lib/db/index';
import { artworks } from '@/lib/db/schema';

async function getUserId() { const session = await auth.api.getSession({ headers: await headers() }); if (!session?.user) throw new Error('Unauthorized'); return session.user.id; }
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);
const artworkSchema = z.object({ title: z.string().trim().min(1).max(160), year: z.coerce.number().int().min(1000).max(3000).optional(), medium: optionalText(120), description: optionalText(1800), dimensions: optionalText(100), imageUrl: z.string().trim().optional().transform((value) => value || null).pipe(z.string().url().nullable()), imagePublicId: optionalText(500), isPublic: z.boolean().default(true), status: z.enum(['available','sold','reserved']).default('available') });
export async function getArtworks() { const userId = await getUserId(); return db.select().from(artworks).where(eq(artworks.userId, userId)).orderBy(desc(artworks.createdAt)); }
export async function createArtwork(input: unknown) { const userId = await getUserId(); const data = artworkSchema.parse(input); if (data.imageUrl && !isOwnAsset(data.imageUrl, 'artwall/artwork')) throw new Error('That artwork image could not be verified. Please upload it again.'); await db.insert(artworks).values({ id: randomUUID(), userId, ...data }); revalidatePath('/studio'); revalidatePath('/studio/artworks'); }
export async function deleteArtwork(id: string) { const userId = await getUserId(); await db.delete(artworks).where(and(eq(artworks.id, id), eq(artworks.userId, userId))); revalidatePath('/studio/artworks'); }
