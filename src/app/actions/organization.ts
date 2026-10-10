"use server";
import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import { tasks } from "@/lib/db/schema";
async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}
// Collections moved to src/features/collections/actions.ts (rebuilt as a
// many-to-many BUYER/ARTIST/CURATOR model instead of a name+description bucket).
export async function getTasks() {
  const userId = await getUserId();
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(desc(tasks.createdAt));
}
