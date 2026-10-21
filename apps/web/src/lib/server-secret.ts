import "server-only";

/**
 * The root server-side HMAC secret.
 *
 * Several unrelated features derive a purpose-separated key from one root
 * secret (`${secret}:physical-wall:qr:v1`, `ugc-owner:${identity}`, the
 * wallet-link salt). That is deliberate: a QR token can never be replayed as a
 * wallet-link signature, even though both trace back to one env var.
 *
 * It used to be `BETTER_AUTH_SECRET`, because better-auth needed one anyway and
 * these features reused it. Supabase Auth now owns sessions and needs no such
 * variable, but these three uses are unrelated to authentication and still need
 * a secret — so it is named for what it actually does.
 *
 * `BETTER_AUTH_SECRET` is still read as a fallback so an existing deployment
 * keeps working without a simultaneous env change. Critically, this means the
 * DERIVED KEYS DO NOT CHANGE when a deployment keeps the old variable: already
 * issued QR tokens stay valid and existing UGC folder paths still resolve.
 * Setting `SERVER_SECRET` to a *different* value would invalidate both.
 */
export function serverSecret(purpose: string): string {
  const secret = process.env.SERVER_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(`SERVER_SECRET is required to sign ${purpose}.`);
  }
  return secret;
}
