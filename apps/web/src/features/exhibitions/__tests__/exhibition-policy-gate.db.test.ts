import { afterAll, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeArtwork, makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import { addArtworkToExhibition, createExhibition, publishExhibition } from "@/features/exhibitions/actions";
import type { Result } from "@/features/physical-wall/action-state";

afterAll(purgeTestData);

function data<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.data;
}
const errorOf = (r: Result<unknown>) => (r.ok ? null : r.error);

const complete = { startDate: "2032-01-01", endDate: "2032-01-31" };

/**
 * BE-3.03/BE-3.04/BE-3.05: publishExhibition must reject when a member
 * artwork has no physical binding and no blockchain anchor — the exact
 * example BE-3.03's task text asks for — and allow once both are real.
 */
describe("exhibition publish policy gate (BE-3.03/3.04/3.05)", () => {
  it("rejects publish when a member artwork has no physical binding and no blockchain anchor", async () => {
    const owner = await makeUser();
    const art = await makeArtwork(owner.id);
    actAs(owner);
    const id = data(await createExhibition({ title: `betest ${tid("show")}`, ...complete }));
    data(await addArtworkToExhibition(id, art));

    const err = errorOf(await publishExhibition(id));
    expect(err).toMatch(/not eligible to exhibit/);
    expect(err).toMatch(/PHYSICAL_BINDING_NOT_VERIFIED/);
    expect(err).toMatch(/BLOCKCHAIN_NOT_ANCHORED/);

    const logged = await q<{ allowed: boolean; reasons: string[] }>(
      `select allowed, reasons from policy_decisions where gate = 'canExhibit' and subject_id = $1 order by decided_at desc limit 1`,
      [art]
    );
    expect(logged[0]?.allowed).toBe(false);

    // The exhibition itself must stay draft — a rejected member artwork
    // blocks the whole publish, not just that one artwork.
    const [row] = await q<{ status: string }>(`select status from exhibitions where id = $1`, [id]);
    expect(row.status).toBe("draft");
  });

  it("allows publish once the member artwork is physically bound and blockchain anchored; writes the exhibition_status domain + the transition audit row", async () => {
    const owner = await makeUser();
    const art = await makeArtwork(owner.id);
    const tag = tid("tag");
    await q(`insert into art_tags (id, tag_uid) values ($1, $1)`, [tag]);
    await q(`update art_tags set artwork_id = $2, bound_at = now(), bound_by = $3 where id = $1`, [tag, art, owner.id]);
    const mint = tid("mint");
    await q(`insert into mint_commitments (id, artwork_id, user_id, leaf_hash, status) values ($1, $2, $3, $1, 'pending')`, [
      mint,
      art,
      owner.id,
    ]);
    await q(`update mint_commitments set status = 'minted', token_id = '1', mint_tx_hash = '0xabc' where id = $1`, [mint]);

    actAs(owner);
    const id = data(await createExhibition({ title: `betest ${tid("show")}`, ...complete }));
    data(await addArtworkToExhibition(id, art));

    const published = data(await publishExhibition(id));
    expect(published.status).toBe("published");

    const [artRow] = await q<{ exhibition_status: string }>(`select exhibition_status from artworks where id = $1`, [art]);
    expect(artRow.exhibition_status).toBe("on_display");

    // BE-3.08: an audit entry per transition, both into draft (create) and
    // into published (this call) — not just the final state.
    const transitions = await q<{ from_status: string | null; to_status: string }>(
      `select from_status, to_status from exhibition_transitions where exhibition_id = $1 order by transitioned_at`,
      [id]
    );
    expect(transitions).toEqual([
      { from_status: null, to_status: "draft" },
      { from_status: "draft", to_status: "published" },
    ]);
  });
});

/**
 * 0079: the physical gate (Bible rules 17-18) applies to a PHYSICAL
 * exhibition only. A virtual one occupies no wall slot — nothing ships,
 * nothing is installed, no QR is bound — so requiring a physical binding
 * would make the 3D building unusable for the works it exists to show
 * (§15/§53).
 *
 * The first test above already proves the physical half: the SAME unbound,
 * unanchored artwork is refused there. These prove the virtual half lets it
 * through, and that nothing else was loosened along with it.
 */
describe("virtual exhibitions are not gated on binding + blockchain (0079)", () => {
  it("publishes with an artwork that has neither binding nor blockchain anchor", async () => {
    const owner = await makeUser();
    const art = await makeArtwork(owner.id);
    actAs(owner);
    const id = data(
      await createExhibition({ title: `betest ${tid("virt")}`, kind: "virtual", ...complete })
    );
    data(await addArtworkToExhibition(id, art));

    const published = data(await publishExhibition(id));
    expect(published.status).toBe("published");

    // No canExhibit decision is logged, because the gate never ran.
    const logged = await q<{ n: string }>(
      `select count(*) as n from policy_decisions where gate = 'canExhibit' and subject_id = $1`,
      [art]
    );
    expect(Number(logged[0].n)).toBe(0);
  });

  it("still enforces the non-policy preconditions (dates, at least one artwork)", async () => {
    const owner = await makeUser();
    actAs(owner);
    const id = data(
      await createExhibition({ title: `betest ${tid("virt")}`, kind: "virtual", ...complete })
    );

    // Skipping the trust gate must not skip "an exhibition needs artworks".
    expect(errorOf(await publishExhibition(id))).toMatch(/at least one artwork/);
  });

  it("defaults to physical, so an existing caller that names no kind stays gated", async () => {
    const owner = await makeUser();
    const art = await makeArtwork(owner.id);
    actAs(owner);
    const id = data(await createExhibition({ title: `betest ${tid("dflt")}`, ...complete }));
    data(await addArtworkToExhibition(id, art));

    expect(errorOf(await publishExhibition(id))).toMatch(/not eligible to exhibit/);
  });

  it("refuses to attach a wall slot to a virtual exhibition (DB CHECK)", async () => {
    const owner = await makeUser();
    actAs(owner);
    const id = data(
      await createExhibition({ title: `betest ${tid("virt")}`, kind: "virtual", ...complete })
    );

    // A virtual show has no physical slot, ever — enforced in the database,
    // not only in the write path that happens to exist today.
    await expect(
      q(`update exhibitions set wall_slot_id = 'any-slot' where id = $1`, [id])
    ).rejects.toThrow(/exhibitions_virtual_has_no_slot/);
  });
});
