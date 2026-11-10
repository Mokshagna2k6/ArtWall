/**
 * Named rate-limit policies. One row per rule; the README mirrors this table.
 *
 * `failOpen` is explicit on every row (no default) so nobody inherits a fail
 * mode by accident:
 *  - false = fail CLOSED: if the store is down we cannot prove the caller is
 *    under the limit, so refuse (503). Auth, uploads, writes, money.
 *  - true  = fail OPEN: public reads, where blocking turns a limiter blip into
 *    a site outage and the worst case is some extra reads.
 */
export interface RateLimitRule {
  limit: number;
  windowMs: number;
  /** Allow the request if the store is unreachable. Public reads only. */
  failOpen?: boolean;
}

export interface PolicyRule extends RateLimitRule {
  failOpen: boolean;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

export const POLICIES = {
  /** Sign-in, per IP across all accounts (credential stuffing). */
  login: { limit: 20, windowMs: 15 * MIN, failOpen: false },
  /** Sign-in, per IP + email (one source guessing one account). */
  "login-identifier": { limit: 5, windowMs: 15 * MIN, failOpen: false },
  signup: { limit: 5, windowMs: HOUR, failOpen: false },
  /** Password-reset request, per IP. Each one sends an email. */
  "password-reset": { limit: 10, windowMs: HOUR, failOpen: false },
  "password-reset-identifier": { limit: 3, windowMs: HOUR, failOpen: false },
  /** Reset-password token submit, per IP. */
  "reset-password": { limit: 10, windowMs: HOUR, failOpen: false },
  /**
   * Provider webhooks (e.g. Razorpay), per IP. The signature check is the real
   * gate; this only caps floods. Fails open so a limiter outage never drops a
   * payment event. Defined here; not yet wired into the webhook route.
   */
  webhook: { limit: 300, windowMs: MIN, failOpen: true },
  /** Public certificate PDF: renders a PDF per CDN miss, so cap per IP. */
  "public-pdf": { limit: 20, windowMs: MIN, failOpen: true },
  /** Public search. */
  search: { limit: 30, windowMs: MIN, failOpen: true },
  /** Cart mutations, per buyer. */
  cart: { limit: 60, windowMs: MIN, failOpen: false },
  /** Checkout start/verify (creates a Razorpay order, reserves stock), per buyer. */
  checkout: { limit: 10, windowMs: 10 * MIN, failOpen: false },
  /**
   * Artwork inquiries and thread replies, per signed-in sender. Each one
   * notifies a real artist, so this fails CLOSED: if the store is down we
   * cannot prove the sender is under the limit, and the cost of guessing wrong
   * is somebody's inbox.
   */
  inquiry: { limit: 10, windowMs: HOUR, failOpen: false },
  /**
   * The AI assistant. Every allowed request bills a real Anthropic API call,
   * and the launcher is on public pages, so this is a direct cost-abuse
   * vector. Fails CLOSED: if the limiter is unreachable we cannot prove the
   * caller is under the limit, and the cost of being wrong is money.
   *
   * Deliberately tight — 15/hour is a long genuine conversation and a poor
   * scraping budget. Anonymous callers get this per IP; signed-in callers get
   * it per account (plus the shared-IP multiple in limitRequest).
   */
  assistant: { limit: 15, windowMs: HOUR, failOpen: false },
  /**
   * Posting a comment, per signed-in author (Bible rule 38: community actions
   * must be abuse-controlled). Public, permanent, attached to someone else's
   * artwork — so this is the spam surface, and it fails CLOSED for the same
   * reason `inquiry` does: if the store is down we cannot prove the author is
   * under the limit, and the cost of guessing wrong is a flooded artwork page.
   *
   * 20/hour is a very talkative genuine visitor and a poor spam budget.
   */
  comment: { limit: 20, windowMs: HOUR, failOpen: false },
  /**
   * Likes, saves and follows, per signed-in actor. Far looser than comments:
   * these are idempotent single-row writes with no public text and no
   * notification, so the realistic abuse is inflating a count, not spamming a
   * person. Still capped — a script toggling a like in a loop is pure write
   * load — and still fails closed, since every one of these is a write.
   */
  "social-action": { limit: 120, windowMs: HOUR, failOpen: false },
  /**
   * Endorsing an artist, per signed-in endorser. Deliberately the tightest
   * social rule: an endorsement feeds a VERIFICATION status, so the damage
   * from automated abuse is reputational, not cosmetic. Only published artists
   * and active curators can endorse at all, which is the real gate; this caps
   * a compromised or malicious eligible account.
   */
  endorsement: { limit: 30, windowMs: HOUR, failOpen: false },
  /** Default for any other API route/action with no specific policy. */
  api: { limit: 120, windowMs: MIN, failOpen: false },
} as const satisfies Record<string, PolicyRule>;

export type PolicyName = keyof typeof POLICIES;

export function getPolicy(name: string): PolicyRule {
  const policy = (POLICIES as Record<string, PolicyRule>)[name];
  if (!policy) throw new Error(`[ratelimit] unknown policy "${name}"`);
  return policy;
}
