import "server-only";

import { randomBytes } from "node:crypto";

import { buildMerkleTree, verifyMerkleProof } from "@/features/coa/merkle";
import { pool } from "@/lib/db/index";

/**
 * Batch every pending mint commitment into one Merkle root.
 *
 * One transaction: the root row, and every commitment's status, root id and
 * proof, commit together — a crash can never leave commitments pointing at a
 * root that does not exist, or a root whose proofs were lost. `skip locked`
 * lets two overlapping cron runs split the work instead of double-batching.
 *
 * Idempotent per batch (BE-2.16): a root is identified by its hash, and the
 * same leaves always give the same hash (buildMerkleTree sorts them). If a
 * re-run meets leaves already rooted (e.g. commitments reset to pending after a
 * failed submission), it re-uses that root row instead of creating a second.
 */
export async function commitPendingMerkleRoot(): Promise<
  { rootId: string; root: string; leafCount: number; reused: boolean } | null
> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: pending } = await client.query<{ id: string; leaf_hash: string }>(
      `select id, leaf_hash from mint_commitments
       where status = 'pending' order by created_at
       for update skip locked`
    );
    if (pending.length === 0) {
      await client.query("rollback");
      return null;
    }

    const { root, proofs } = buildMerkleTree(pending.map((p) => p.leaf_hash));
    const inserted = await client.query<{ id: string }>(
      `insert into merkle_roots (id, root_hash, leaf_count, status) values ($1, $2, $3, 'pending')
       on conflict (root_hash) do nothing returning id`,
      [`mr_${randomBytes(9).toString("base64url")}`, root, pending.length]
    );
    const reused = inserted.rowCount === 0;
    const rootId = reused
      ? (await client.query<{ id: string }>(`select id from merkle_roots where root_hash = $1`, [root])).rows[0].id
      : inserted.rows[0].id;

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
    return { rootId, root, leafCount: pending.length, reused };
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

/**
 * The Merkle proof for a certificate (BE-2.17): the certificate's mint
 * commitment (same artwork and edition), its leaf, sibling path and root.
 * `verified` re-checks the path against the stored root, as the contract will.
 * Null until the commitment has been batched into a root.
 */
export async function getCertificateProof(certificateId: string) {
  const { rows } = await pool.query<{
    commitment_id: string;
    leaf_hash: string;
    merkle_proof: string[];
    root_hash: string;
    root_status: string;
    tx_hash: string | null;
  }>(
    `select c.id as commitment_id, c.leaf_hash, c.merkle_proof, r.root_hash, r.status as root_status, r.tx_hash
     from coa_certificates cert
     join mint_commitments c on c.artwork_id = cert.artwork_id and c.edition_id is not distinct from cert.edition_id
     join merkle_roots r on r.id = c.merkle_root_id
     where cert.id = $1 and c.merkle_proof is not null
     order by c.created_at desc limit 1`,
    [certificateId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    certificateId,
    commitmentId: row.commitment_id,
    leaf: row.leaf_hash,
    proof: row.merkle_proof,
    root: row.root_hash,
    rootStatus: row.root_status,
    rootTxHash: row.tx_hash,
    verified: verifyMerkleProof(row.leaf_hash, row.merkle_proof, row.root_hash),
  };
}
