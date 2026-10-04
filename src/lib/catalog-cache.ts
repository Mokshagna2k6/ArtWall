import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import { and, eq, ne, or } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { artistProfiles, artworks, coaCertificates } from "@/lib/db/schema";

/**
 * Data cache for the public catalogue (PERF-2.06/2.07): /discover, /artists,
 * /artist/[handle], /artwork/[id], /exhibitions/[id], /verify/[hash].
 *
 * Why the data cache and not the full-route cache: the root layout reads the
 * session (the header shows who is signed in), so every page renders
 * dynamically. What we can skip is the database - these reads are identical
 * for every visitor. This app is not on Cache Components, so the Next 16 tool
 * for that is `unstable_cache` + tags (node_modules/next/dist/docs/01-app/
 * 02-guides/caching-without-cache-components.md), the same pattern as
 * features/wall/data.ts.
 *
 * ONE tag for the whole catalogue. An artist's name is on their artworks, on
 * /discover, on exhibitions and on certificates; per-entity tags would need
 * every mutation to know every page that shows what it touched. Writes are
 * rare (artists editing their own work), reads are every visitor.
 * ponytail: one tag, so any catalogue write refreshes every catalogue entry;
 * split per artist/artwork if write volume ever makes the hit rate suffer.
 *
 * Every mutation of artworks, artist_profiles, exhibitions, coa_certificates
 * or provenance_events must call `expireCatalog()`. The `revalidate` windows
 * are only a safety net for a writer that forgets.
 */
export const CATALOG_TAG = "catalog";

/**
 * Expire the catalogue now. `revalidateTag(..., { expire: 0 })` rather than
 * `updateTag` because it works in Server Actions AND Route Handlers/crons
 * (updateTag throws outside a Server Action), and rather than "max" because a
 * revoked certificate must never be served stale, not even once.
 */
export function expireCatalog() {
  revalidateTag(CATALOG_TAG, { expire: 0 });
}

/** What survives unstable_cache's JSON round trip: a Date comes back as a string. */
export type Cached<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Cached<U>[]
    : T extends object
      ? { [K in keyof T]: Cached<T[K]> }
      : T;

/** Cache a public catalogue read under CATALOG_TAG. Arguments are part of the key. */
export function cachedCatalog<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  key: string,
  revalidateSeconds: number
) {
  return unstable_cache(fn, ["catalog", key], {
    tags: [CATALOG_TAG],
    revalidate: revalidateSeconds,
  }) as unknown as (...args: A) => Promise<Cached<R>>;
}

/**
 * A certificate by metadata hash or id, for /verify (PERF-2.07). Viewer
 * independent on purpose - the "is this my certificate" check happens outside
 * the cache - so one cached copy serves every visitor. A certificate only
 * changes through issue/revoke/mint, which all expire the tag, so the long
 * window (a day) just bounds how long a forgotten writer could leave it stale.
 *
 * FE-2.09: a "draft" certificate has never been issued, so its details (and
 * the fact that it exists at all) are not public yet - excluded here rather
 * than filtered on the page, so a draft can never reach the client at all.
 */
export const getCertificateForVerify = cachedCatalog(
  async (hash: string) => {
    const [cert] = await db
      .select({
        id: coaCertificates.id,
        artworkId: coaCertificates.artworkId,
        ownerId: coaCertificates.userId,
        status: coaCertificates.status,
        issuedAt: coaCertificates.issuedAt,
        revokedAt: coaCertificates.revokedAt,
        artworkTitle: artworks.title,
        artworkImage: artworks.imageUrl,
        medium: artworks.medium,
        dimensions: artworks.dimensions,
        year: artworks.year,
        artistName: artistProfiles.displayName,
        // On-chain anchor (FE-2.10): null fields mean "not anchored".
        txHash: coaCertificates.txHash,
        chainId: coaCertificates.chainId,
        contractAddr: coaCertificates.contractAddr,
        tokenId: coaCertificates.tokenId,
      })
      .from(coaCertificates)
      .innerJoin(artworks, eq(coaCertificates.artworkId, artworks.id))
      .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
      // By metadata hash (COA PDFs, artwork pages) or by certificate id: NFT
      // metadata can't embed its own hash, so its external_url uses the id.
      .where(
        and(
          or(eq(coaCertificates.metadataHash, hash), eq(coaCertificates.id, hash)),
          ne(coaCertificates.status, "draft")
        )
      );
    return cert ?? null;
  },
  "verify",
  86_400
);
