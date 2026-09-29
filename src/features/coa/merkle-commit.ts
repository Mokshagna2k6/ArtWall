import "server-only";

import { randomBytes } from "node:crypto";

import { buildMerkleTree } from "@/features/coa/merkle";
import { pool } from "@/lib/db/index";

/**
 * Batch every pending mint commitment into one Merkle root.
 *
 * One transaction: the root row, and every commitment's status, root id and
 * proof, commit together — a crash can never leave commitments pointing at a
 * root that does not exist, or a root whose proofs were lost. `skip locked`
 * lets two overlapping cron runs split the work instead of double-batching.
 */
export async function commitPendingMerkleRoot(): Promise<
  { rootId: string; root: string; leafCount: number } | null
> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: pending } = await client.query<{ id: string; leaf_hash: string }>(
      `select id, leaf_hash from mint_commitments
       where status = 'pending' order by created_at
       limit 1000 -- one bounded root per run (PERF-2.09); the rest wait for the next
       for update skip locked`
    );
    if (pending.length === 0) {
      await client.query("rollback");
      return null;
    }

    const { root, proofs } = buildMerkleTree(pending.map((p) => p.leaf_hash));
    const rootId = `mr_${randomBytes(9).toString("base64url")}`;

    await client.query(
      `insert into merkle_roots (id, root_hash, leaf_count, status) values ($1, $2, $3, 'pending')`,
      [rootId, root, pending.length]
    );

    for (const p of pending) {
      const proof = proofs.get(p.leaf_hash.toLowerCase() as `0x${string}`);
      if (!proof) throw new Error(`No proof built for commitment ${p.id}`);
      await client.query(
        `update mint_commitments
         set status = 'committed', merkle_root_id = $2, merkle_proof = $3::jsonb
         where id = $1`,
        [p.id, rootId, JSON.stringify(proof)]
      );
    }

    await client.query("commit");
    return { rootId, root, leafCount: pending.length };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Everything a minter (or a verifier) needs for one commitment. */
export async function getMintProof(commitmentId: string) {
  const { rows } = await pool.query<{
    leaf_hash: string;
    merkle_proof: string[] | null;
    root_hash: string | null;
    root_status: string | null;
  }>(
    `select c.leaf_hash, c.merkle_proof, r.root_hash, r.status as root_status
     from mint_commitments c left join merkle_roots r on r.id = c.merkle_root_id
     where c.id = $1`,
    [commitmentId]
  );
  const row = rows[0];
  if (!row?.root_hash || !row.merkle_proof) return null;
  return {
    leaf: row.leaf_hash,
    proof: row.merkle_proof,
    root: row.root_hash,
    rootStatus: row.root_status,
  };
}
