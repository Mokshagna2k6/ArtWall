import { afterAll, describe, expect, it } from "vitest";

import { makeArtwork, makeProfile, makeUser, purgeTestData, q, tid } from "@/test/fixtures";

/**
 * The social layer's database guarantees (0075).
 *
 * These assert the rules the application code relies on but does not itself
 * enforce — the ones that must hold even if a future caller forgets them.
 * The server actions' own authorization is tested through the behaviour of
 * these constraints plus the ownership checks in actions.ts.
 */

afterAll(purgeTestData);

describe("likes", () => {
  it("counts one like per person however many times they tap", async () => {
    const owner = (await makeUser()).id;
    const liker = (await makeUser()).id;
    const artwork = await makeArtwork(owner);

    // The upsert the action performs, run twice — a double-tap from two tabs.
    for (let i = 0; i < 2; i += 1) {
      await q(
        `insert into artwork_likes (artwork_id, user_id) values ($1, $2)
         on conflict do nothing`,
        [artwork, liker]
      );
    }

    const rows = await q<{ count: string }>(
      `select count(*) as count from artwork_likes where artwork_id = $1`,
      [artwork]
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it("removes likes with the artwork rather than orphaning them", async () => {
    const owner = (await makeUser()).id;
    const liker = (await makeUser()).id;
    const artwork = await makeArtwork(owner);

    await q(`insert into artwork_likes (artwork_id, user_id) values ($1, $2)`, [artwork, liker]);
    await q(`delete from artworks where id = $1`, [artwork]);

    const rows = await q<{ count: string }>(
      `select count(*) as count from artwork_likes where artwork_id = $1`,
      [artwork]
    );
    expect(Number(rows[0].count)).toBe(0);
  });
});

describe("comments", () => {
  it("keeps replies readable after the parent is soft-deleted", async () => {
    const owner = (await makeUser()).id;
    const author = (await makeUser()).id;
    const replier = (await makeUser()).id;
    const artwork = await makeArtwork(owner);

    const parent = tid("cmt");
    const reply = tid("cmt");
    await q(
      `insert into artwork_comments (id, artwork_id, user_id, body) values ($1, $2, $3, 'parent')`,
      [parent, artwork, author]
    );
    await q(
      `insert into artwork_comments (id, artwork_id, user_id, parent_id, body)
       values ($1, $2, $3, $4, 'reply')`,
      [reply, artwork, replier, parent]
    );

    // A soft delete, as deleteComment performs it.
    await q(`update artwork_comments set deleted_at = now() where id = $1`, [parent]);

    const rows = await q<{ id: string }>(
      `select id from artwork_comments where id = $1`,
      [reply]
    );
    // The reply must survive — this is why the delete is soft.
    expect(rows).toHaveLength(1);
  });

  it("refuses an empty comment at the database, not just in Zod", async () => {
    const owner = (await makeUser()).id;
    const artwork = await makeArtwork(owner);

    await expect(
      q(`insert into artwork_comments (id, artwork_id, user_id, body) values ($1, $2, $3, '')`, [
        tid("cmt"),
        artwork,
        owner,
      ])
    ).rejects.toThrow(/artwork_comments_body_len/);
  });
});

describe("follows", () => {
  it("refuses a self-follow", async () => {
    const user = (await makeUser()).id;
    await expect(
      q(`insert into user_follows (follower_id, followee_id) values ($1, $1)`, [user])
    ).rejects.toThrow(/user_follows_no_self/);
  });
});

describe("endorsements", () => {
  it("refuses a self-endorsement", async () => {
    const artist = (await makeUser()).id;
    await expect(
      q(`insert into artist_endorsements (id, artist_id, endorser_id, kind) values ($1, $2, $2, 'peer')`, [
        tid("end"),
        artist,
      ])
    ).rejects.toThrow(/artist_endorsements_no_self/);
  });

  it("refuses a kind outside peer/curator, so a caller cannot invent a weight", async () => {
    const artist = (await makeUser()).id;
    const endorser = (await makeUser()).id;
    await expect(
      q(
        `insert into artist_endorsements (id, artist_id, endorser_id, kind)
         values ($1, $2, $3, 'admin')`,
        [tid("end"), artist, endorser]
      )
    ).rejects.toThrow(/artist_endorsements_kind/);
  });

  it("counts one endorsement per endorser however many times they submit", async () => {
    const artist = (await makeUser()).id;
    const endorser = (await makeUser()).id;

    // The upsert endorseArtist performs, run twice.
    for (const note of ["first", "second"]) {
      await q(
        `insert into artist_endorsements (id, artist_id, endorser_id, kind, note)
         values ($1, $2, $3, 'peer', $4)
         on conflict (artist_id, endorser_id) do update set note = excluded.note`,
        [tid("end"), artist, endorser, note]
      );
    }

    const rows = await q<{ count: string }>(
      `select count(*) as count from artist_endorsements where artist_id = $1`,
      [artist]
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it("refuses a verification_status outside the three known values", async () => {
    const artist = (await makeUser()).id;
    await makeProfile(artist);

    await expect(
      q(`update artist_profiles set verification_status = 'admin_blessed' where "userId" = $1`, [
        artist,
      ])
    ).rejects.toThrow(/verification_status/);
  });
});
