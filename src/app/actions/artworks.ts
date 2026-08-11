'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db/index';
import { artworks } from '@/lib/db/schema';

async function getUserId() { const session = await auth.api.getSession({ headers: await headers() }); if (!session?.user) throw new Error('Unauthorized'); return session.user.id; }
const artworkSchema = z.object({ title: z.string().trim().min(1).max(160), year: z.coerce.number().int().min(1000).max(3000).optional(), medium: z.string().trim().max(120).optional(), status: z.enum(['available','sold','reserved']).default('available') });
export async function getArtworks() { const userId = await getUserId(); return db.select().from(artworks).where(eq(artworks.userId, userId)).orderBy(desc(artworks.createdAt)); }
export async function createArtwork(input: unknown) { const userId = await getUserId(); const data = artworkSchema.parse(input); await db.insert(artworks).values({ id: randomUUID(), userId, title: data.title, year: data.year, medium: data.medium, status: data.status }); revalidatePath('/studio/artworks'); }
export async function deleteArtwork(id: string) { const userId = await getUserId(); await db.delete(artworks).where(and(eq(artworks.id, id), eq(artworks.userId, userId))); revalidatePath('/studio/artworks'); }
