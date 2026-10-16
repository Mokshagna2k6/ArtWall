import "server-only";

import { faqs, howItWorks, services } from "@/config/content";
import { siteConfig } from "@/config/site";

/**
 * The ArtWall assistant's model, grounding and guard rails (CHANGES-PLAN §8.1).
 *
 * `ANTHROPIC_API_KEY` is read here and NOWHERE in any client component — the
 * key is server-side only. `assistantEnabled()` is what the UI asks, so a
 * missing key makes the launcher disappear instead of breaking a page or the
 * build (decided 2026-10-15).
 */

/**
 * Claude Opus 5.5 — the current default model.
 *
 * Adaptive thinking is always on for this model and cannot be disabled; depth
 * is controlled with `output_config.effort`, which this route sets to "low":
 * these are short grounded answers about one product, not reasoning problems,
 * and low effort is both cheaper and faster for a chat widget.
 */
export const ASSISTANT_MODEL = "claude-opus-5-5";

/** Short answers. A support widget that writes essays is a worse widget. */
export const ASSISTANT_MAX_TOKENS = 1024;

/** Per message, enforced by Zod before the model is ever called. */
export const MESSAGE_MAX_CHARS = 1000;

/** How much conversation the client may send back. Caps replay cost. */
export const MAX_HISTORY_MESSAGES = 20;

/** True when the feature can actually run. The UI must not render without it. */
export function assistantEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * The grounding corpus, built from the site's own copy (`config/content.ts`)
 * rather than retyped into a prompt. If the marketing copy changes, the
 * assistant's facts change with it and cannot drift silently.
 */
function groundingText(): string {
  const faqText = faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n");
  const serviceText = services
    .map((s) => `${s.number}. ${s.title} — ${s.summary}\n${s.detail}`)
    .join("\n\n");
  const stepText = howItWorks
    .map((s) => `${s.number}. ${s.title}: ${s.detail}`)
    .join("\n");

  return [
    `ArtWall — ${siteConfig.description}`,
    `## Frequently asked questions\n${faqText}`,
    `## What ArtWall offers\n${serviceText}`,
    `## How it works\n${stepText}`,
  ].join("\n\n");
}

/**
 * The system prompt.
 *
 * The hard parts are the refusals, not the persona. Three categories of
 * answer are forbidden outright because a wrong answer there is a trust
 * problem rather than a bad UX:
 *
 *  - **Authenticity and provenance.** The assistant must never say whether a
 *    work is genuine, nor interpret a certificate or a tag. That is what the
 *    verification pages are for, and a confident wrong answer about
 *    authenticity is the single most damaging thing this widget could do.
 *  - **Prices and fees for a specific work or account.** It may repeat
 *    published platform pricing from the grounding text; it must not quote,
 *    estimate or negotiate a number for an individual artwork.
 *  - **Policy, legal and commitments.** No invented terms, timelines,
 *    refunds, guarantees or eligibility rulings.
 *
 * The escape hatch is escalation: when the honest answer is "I don't know",
 * it says so and offers a human (Bible §44 is also respected here — the
 * assistant is never given a demand score, threshold or confidence figure to
 * leak, because none is in its context).
 */
export function systemPrompt(): string {
  return `You are the ArtWall assistant, on ArtWall — India's art operating system for artists, buyers, curators and venues.

Answer questions about ArtWall using ONLY the reference material below. Be brief: two or three sentences for most questions, and plain language over marketing language.

## What you must never do

1. **Never judge authenticity or provenance.** Do not say whether an artwork, certificate, signature or NFC/QR tag is genuine, and do not interpret what a specific certificate proves. Point people at the verification page for that work, or offer a human. A wrong answer about authenticity damages real trust.
2. **Never quote, estimate or negotiate a price for a specific artwork**, and never state a fee, commission or royalty that is not in the reference material below. You may repeat ArtWall's published platform pricing from that material.
3. **Never invent policy.** No terms, refund rules, timelines, legal positions, guarantees, or rulings about whether a person or work qualifies for something. If it is not written below, you do not know it.
4. **Never state anything about a particular user's account, order, artwork or payout.** You cannot see any of that.

## When you do not know

Say so plainly in one sentence, then offer to pass the question to a person on the ArtWall team. Do not guess, do not approximate, and do not pad the answer. "I don't know, but I can get someone who does" is a correct and useful answer here.

If someone is upset, is asking about money that has moved, or is reporting that something is wrong, offer the human immediately rather than troubleshooting.

## Reference material

${groundingText()}`;
}
