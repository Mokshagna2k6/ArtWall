import "server-only";

import { getSql } from "@/lib/db";

/**
 * Artist-facing analytics (Phase 1, F21).
 *
 * Aggregate counts only — the same privacy story as reactions. An artist sees
 * how many people scanned their work and which piece drew the crowd; they do
 * not see who, because we never recorded who.
 */

export interface ArtworkEngagement {
  artworkId: string;
  title: string;
  scans: number;
  scansLast7d: number;
  reactions: number;
}

export interface ScanStats {
  totalScans: number;
  scansLast7d: number;
  totalReactions: number;
  perArtwork: ArtworkEngagement[];
}

export async function myScanStats(artistId: string): Promise<ScanStats> {
  const empty: ScanStats = {
    totalScans: 0,
    scansLast7d: 0,
    totalReactions: 0,
    perArtwork: [],
  };

  try {
    const sql = getSql();
    const rows = (await sql`
      select a.id as "artworkId",
             coalesce(a.title, 'Untitled') as title,
             (select count(*)::int from pw_scans s
              where s.artwork_id = a.id) as scans,
             (select count(*)::int from pw_scans s
              where s.artwork_id = a.id
                and s.created_at > now() - interval '7 days') as "scansLast7d",
             (select coalesce(sum(r.count), 0)::int from pw_reactions r
              where r.artwork_id = a.id) as reactions
      from artworks a
      where a."userId" = ${artistId}
      order by scans desc, title asc
      limit 50
    `) as {
      artworkId: string;
      title: string;
      scans: number;
      scansLast7d: number;
      reactions: number;
    }[];

    return {
      totalScans: rows.reduce((sum, r) => sum + Number(r.scans), 0),
      scansLast7d: rows.reduce((sum, r) => sum + Number(r.scansLast7d), 0),
      totalReactions: rows.reduce((sum, r) => sum + Number(r.reactions), 0),
      perArtwork: rows.map((r) => ({
        artworkId: r.artworkId,
        title: r.title,
        scans: Number(r.scans),
        scansLast7d: Number(r.scansLast7d),
        reactions: Number(r.reactions),
      })),
    };
  } catch (error) {
    console.error("[physical-wall] Could not read scan stats", error);
    return empty;
  }
}