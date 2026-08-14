"use server";
import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import { contacts } from "@/lib/db/schema";
async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}
const contactSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().email().optional(),
  kind: z
    .enum(["collector", "curator", "gallery", "collaborator"])
    .default("collector"),
});
export async function getContacts() {
  const userId = await getUserId();
  return db
    .select()
    .from(contacts)
    .where(eq(contacts.userId, userId))
    .orderBy(desc(contacts.createdAt));
}
export async function createContact(input: unknown) {
  const userId = await getUserId();
  const data = contactSchema.parse(input);
  await db.insert(contacts).values({
    id: randomUUID(),
    userId,
    name: data.name,
    email: data.email,
    kind: data.kind,
  });
  revalidatePath("/studio/contacts");
}
