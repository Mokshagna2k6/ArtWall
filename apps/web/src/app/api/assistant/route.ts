import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";

import {
  ASSISTANT_MAX_TOKENS,
  ASSISTANT_MODEL,
  MAX_HISTORY_MESSAGES,
  MESSAGE_MAX_CHARS,
  assistantEnabled,
  systemPrompt,
} from "@/features/assistant/config";
import { auth } from "@/lib/auth";
import { limitPolicy, tooManyRequests } from "@/lib/rate-limit";

/**
 * The AI assistant's streamed reply (CHANGES-PLAN §8.1).
 *
 * The API key is read only in `features/assistant/config.ts`, on the server.
 * It is never in a prop, a response body or a client bundle.
 *
 * Rate limited BEFORE the model is called, under the `assistant` policy
 * (15/hour, fails closed). Every allowed request bills a real Anthropic call
 * from a launcher that sits on public pages, so this is the cost gate.
 */

export const dynamic = "force-dynamic";
// Node, not edge: the Anthropic SDK and the Postgres-backed rate-limit store
// both expect Node APIs.
export const runtime = "nodejs";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(MESSAGE_MAX_CHARS),
      })
    )
    .min(1)
    .max(MAX_HISTORY_MESSAGES),
});

export async function POST(request: Request) {
  // A missing key is a disabled feature, never a 500. The launcher is hidden
  // in this state, so reaching here means a direct call.
  if (!assistantEnabled()) {
    return NextResponse.json(
      { error: "The assistant is not available right now." },
      { status: 503 }
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const limit = await limitPolicy("assistant", session?.user.id ?? null, request.headers);
  if (!limit.ok) {
    return tooManyRequests(limit, {
      error: "You have reached the assistant's limit for now. Try again a little later.",
    });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const client = new Anthropic();

  try {
    const stream = client.messages.stream({
      model: ASSISTANT_MODEL,
      max_tokens: ASSISTANT_MAX_TOKENS,
      // Short grounded answers about one product, not a reasoning task:
      // low effort is cheaper and faster, and thinking cannot be disabled on
      // this model anyway.
      output_config: { effort: "low" },
      system: systemPrompt(),
      messages: parsed.data.messages,
    });

    // Plain text, not SSE: the client only needs the prose as it arrives, and
    // a text stream keeps the reader on both sides trivial.
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          const final = await stream.finalMessage();
          // A safety decline arrives as HTTP 200 with this stop reason, so it
          // has to be checked rather than assumed away.
          if (final.stop_reason === "refusal") {
            controller.enqueue(
              encoder.encode(
                "\n\nI can't help with that one. I can pass it to someone on the ArtWall team if you'd like."
              )
            );
          }
        } catch (error) {
          // Mid-stream failure: the client already has partial text, so append
          // a readable sentence rather than destroying the stream.
          console.error("[assistant] stream failed", error);
          controller.enqueue(
            encoder.encode("\n\nSomething went wrong on our side. Please try again.")
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // Never leak an SDK error, which can carry request details.
    console.error("[assistant] request failed", error);
    return NextResponse.json(
      { error: "The assistant could not answer just now. Please try again." },
      { status: 502 }
    );
  }
}
