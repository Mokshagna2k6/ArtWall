"use server";

import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { MESSAGE_MAX_CHARS } from "@/features/assistant/config";
import { enforcePolicy } from "@/features/orders/rate-limit";
import {
  attempt,
  newId,
  parseInput,
  PreconditionError,
  type Result,
} from "@/features/physical-wall/actions/shared";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import { inquiries, inquiryMessages, user as userTable } from "@/lib/db/schema";

/**
 * Escalating an assistant conversation to a human (CHANGES-PLAN §8.1).
 *
 * **Decided: an escalation lands in the §8.5 inquiries inbox** — one message
 * system, one inbox. So this writes an `inquiries` row with
 * `source = 'assistant'` and no artwork (migration 0070) and reuses the whole
 * existing pipeline: the same table, the same thread view, the same reply
 * path. No second messaging system.
 *
 * Sign-in is required, for the same reason an inquiry requires it: an
 * escalation notifies a real person, so it needs an identity to rate-limit.
 * Rate limited under the shared `inquiry` policy, deliberately — a user
 * should not be able to escalate 10 times via the chat widget and another 10
 * via artwork inquiries.
 *
 * Follows the project action contract: parseInput (zod) → attempt →
 * Result<T>. `action-contracts.test.ts` scans for that shape.
 */

const escalateSchema = z.object({
  /** What the person wants a human to answer. */
  question: z
    .string()
    .trim()
    .min(1, "Say what you would like help with.")
    .max(MESSAGE_MAX_CHARS, `Keep it under ${MESSAGE_MAX_CHARS} characters.`),
  /** The chat so far, so a human has the context and the person need not retype it. */
  transcript: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(MESSAGE_MAX_CHARS),
      })
    )
    .max(20)
    .default([]),
});

/**
 * Who receives an escalation.
 *
 * The oldest admin account, which in this codebase is the platform's own
 * operator (`user.role = 'admin'`; see AGENTS.md on the role tier). Resolved
 * at write time rather than configured, because a hardcoded id would rot and
 * an unroutable escalation is worse than a refused one.
 *
 * shortcut: a single recipient, not a support queue or round-robin. Upgrade
 * when a real support-team assignment model exists; the inquiry row already
 * carries everything a queue would need to reassign it.
 */
async function resolveSupportRecipient(): Promise<string> {
  const [staff] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.role, "admin"))
    .orderBy(asc(userTable.createdAt))
    .limit(1);

  if (!staff) {
    throw new PreconditionError(
      "There is nobody available to take this right now. Please try again later."
    );
  }
  return staff.id;
}

export async function escalateToHuman(
  raw: z.input<typeof escalateSchema>
): Promise<Result<{ inquiryId: string }>> {
  return attempt("escalateToHuman", async () => {
    const input = parseInput(escalateSchema, raw);

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      throw new PreconditionError("Sign in so the team can reply to you.");
    }
    const sender = session.user;

    // Shared with artwork inquiries on purpose: one budget per person across
    // both ways of reaching a human.
    await enforcePolicy("inquiry", sender.id);

    const recipientId = await resolveSupportRecipient();
    if (recipientId === sender.id) {
      throw new PreconditionError("You already handle these.");
    }

    const inquiryId = newId("inq");
    await db.insert(inquiries).values({
      id: inquiryId,
      artworkId: null,
      source: "assistant",
      senderId: sender.id,
      recipientId,
      subject: `Assistant escalation: ${input.question.slice(0, 80)}`,
      lastMessageAt: new Date(),
    });

    // The transcript goes in as the first message so the human sees what the
    // assistant already said and does not repeat it. Trimmed to the cap the
    // column CHECKs (0069), so a long chat cannot fail the insert.
    const transcript = input.transcript
      .map((turn) => `${turn.role === "user" ? "Visitor" : "Assistant"}: ${turn.content}`)
      .join("\n\n");

    const body = transcript
      ? `${input.question}\n\n— Conversation with the ArtWall assistant —\n\n${transcript}`
      : input.question;

    await db.insert(inquiryMessages).values({
      id: newId("imsg"),
      inquiryId,
      authorId: sender.id,
      body: body.slice(0, 2000),
    });

    revalidatePath("/studio/contacts");
    return { inquiryId };
  });
}
