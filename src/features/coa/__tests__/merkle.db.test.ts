import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { makeArtwork, makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import { verifyMerkleProof } from "@/features/coa/merkle";
import { commitPendingMerkleRoot } from "@/features/coa/merkle-commit";
import { GET as proofRoute } from "@/app/api/coa/[id]/proof/route";

afterAll(purgeTestData);

/** n issued certificates, each with a pending mint commitment (a random leaf). */
async function certificatesWithCommitments(n: number) {
  const artist = await makeUser();
  const certs: { certId: string; commitmentId: string; leaf: string }[] = [];
  for (let i = 0; i < n; i++) {
    const art = await makeArtwork(artist.id);
    const certId = tid("coa");
    const commitmentId = tid("mint");
    const leaf = `0x${randomBytes(32).toString("hex")}`;
    await q(
      `insert into coa_certificates (id, artwork_id, user_id, metadata_hash, status, issued_at)
       values ($1, $2, $3, $4, 'issued', now())`,
      [certId, art, artist.id, randomBytes(32).toString("hex")]
    );
    await q(
      `insert into mint_commitments (id, artwork_id, user_id, leaf_hash, wallet_address, status)
       values ($1, $2, $3, $4, '0x1111111111111111111111111111111111111111', 'pending')`,
      [commitmentId, art, artist.id, leaf]
    );
    certs.push({ certId, commitmentId, leaf });
  }
  return certs;
}

const proofFor = (certId: string) =>
  proofRoute(new Request(`http://x/api/coa/${certId}/proof`), { params: Promise.resolve({ id: certId }) });

describe("Merkle anchoring (BE-2.16 / BE-2.17)", () => {
  it("the proof endpoint returns a proof that verifies against the stored root, for every leaf of a 9-leaf batch", async () => {
    const certs = await certificatesWithCommitments(9);
    const result = await commitPendingMerkleRoot();
    expect(result).not.toBeNull();

    const [stored] = await q<{ root_hash: string }>(`select root_hash from merkle_roots where id = $1`, [result!.rootId]);
    const rootIds = await q<{ merkle_root_id: string }>(
      `select distinct merkle_root_id from mint_commitments where id = any($1)`,
      [certs.map((c) => c.commitmentId)]
    );
    expect(rootIds).toEqual([{ merkle_root_id: result!.rootId }]); // all nine in one batch

    for (const c of certs) {
      const res = await proofFor(c.certId);
      expect(res.status, c.certId).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ certificateId: c.certId, commitmentId: c.commitmentId, leaf: c.leaf, root: stored.root_hash, verified: true });
      // Independently of the endpoint's own flag: the path hashes up to the root in the DB.
      expect(verifyMerkleProof(c.leaf, body.proof, stored.root_hash)).toBe(true);
      // And not to any other root: a tampered path fails.
      expect(verifyMerkleProof(c.leaf, [...body.proof].reverse().concat(c.leaf), stored.root_hash)).toBe(false);
    }
    // ceil(log2(9)) = 4 levels; the promoted 9th leaf has a shorter path.
    const lengths = await Promise.all(certs.map(async (c) => (await (await proofFor(c.certId)).json()).proof.length));
    expect(Math.max(...lengths)).toBeLessThanOrEqual(4);
  });

  it("404 before batching, 400 for a junk id", async () => {
    const [c] = await certificatesWithCommitments(1);
    expect((await proofFor(c.certId)).status).toBe(404);
    expect((await proofFor(" ")).status).toBe(400);
    await commitPendingMerkleRoot(); // leave nothing pending for other tests
  });

  it("re-running over the same leaves re-uses the root: never a second root for one leaf set (BE-2.16)", async () => {
    const certs = await certificatesWithCommitments(5);
    const ids = certs.map((c) => c.commitmentId);
    const reset = () =>
      q(`update mint_commitments set status = 'pending', merkle_root_id = null, merkle_proof = null where id = any($1)`, [ids]);

    await commitPendingMerkleRoot();
    // Simulate a re-run over exactly these leaves (twice, so the first rooting
    // is of these five alone even if other pending rows were swept in above).
    await reset();
    const first = await commitPendingMerkleRoot();
    await reset();
    const again = await commitPendingMerkleRoot();

    expect(again!.root).toBe(first!.root);
    expect(again!.rootId).toBe(first!.rootId);
    expect(again!.reused).toBe(true);
    expect(await q(`select 1 from merkle_roots where root_hash = $1`, [first!.root])).toHaveLength(1);

    // And a plain re-run with nothing pending does nothing.
    expect(await commitPendingMerkleRoot()).toBeNull();
  });
});
