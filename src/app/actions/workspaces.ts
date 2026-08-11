'use server';
import { randomUUID } from 'crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/index';
import { documents, rooms, sales } from '@/lib/db/schema';
async function userId() { const session = await auth.api.getSession({ headers: await headers() }); if (!session?.user) throw new Error('Unauthorized'); return session.user.id; }
export async function getSales() { const id = await userId(); return db.select().from(sales).where(eq(sales.userId, id)).orderBy(desc(sales.createdAt)); }
export async function getDocuments() { const id = await userId(); return db.select().from(documents).where(eq(documents.userId, id)).orderBy(desc(documents.createdAt)); }
export async function getRooms() { const id = await userId(); return db.select().from(rooms).where(eq(rooms.userId, id)).orderBy(desc(rooms.createdAt)); }
export async function createRoom(input: unknown) { const id = await userId(); const data = z.object({ name: z.string().trim().min(1).max(100), slug: z.string().trim().min(1).max(100) }).parse(input); await db.insert(rooms).values({ id: randomUUID(), userId: id, ...data }); revalidatePath('/studio/rooms'); }
