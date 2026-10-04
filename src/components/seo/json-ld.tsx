import { headers } from "next/headers";

/**
 * JSON for an inline <script type="application/ld+json">. JSON.stringify does not
 * escape "<", so a user-controlled string containing "</script>" would close the
 * tag and inject markup. < is the same character to a JSON parser.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

// SEC-2.03: the CSP has no `unsafe-inline` for scripts, so this inline tag only
// executes (parsing, here — it's not executable JS, but the directive still
// applies to any inline <script>) if it carries the per-request nonce
// proxy.ts puts on the CSP header and on the `x-nonce` request header.
export async function JsonLd({ data }: { data: unknown }) {
  const nonce = (await headers()).get("x-nonce");
  return (
    <script
      type="application/ld+json"
      nonce={nonce ?? undefined}
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
