"use server";
import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import { collections, tasks } from "@/lib/db/schema";
import { formInvalid, type FormResult } from "@/lib/form-result";
async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}
export async function getCollections() {
  const userId = await getUserId();
  return db
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(desc(collections.createdAt));
}
export async function createCollection(input: unknown): Promise<FormResult> {
  const userId = await getUserId();
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(160),
      description: z.string().max(500).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return formInvalid(parsed.error);
  await db.insert(collections).values({ id: randomUUID(), userId, ...parsed.data });
  revalidatePath("/studio/collections");
  return { ok: true };
}
export async function getTasks() {
  const userId = await getUserId();
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(desc(tasks.createdAt));
}
