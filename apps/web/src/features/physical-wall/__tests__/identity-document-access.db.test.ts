import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import { getIdentityDocumentUrl } from "@/features/physical-wall/actions/identity";

/**
 * SEC-2.08: identity documents are stored in private (authenticated-delivery)
 * Cloudinary storage, viewable only through a short-lived signed URL minted
 * for the document's owner or an admin, with every successful access
 * audit-logged.
 *
 * Real Cloudinary: uploads a 1x1 PNG with `type: "authenticated"` under
 * artwall/betest/, same as dpdp.db.test's `upload()` helper but for the
 * private delivery type identity documents actually use. Skips itself with
 * no real Cloudinary account (CI without secrets, vitest.db.config's
 * stand-in), same guard dpdp.db.test uses - there's nothing to sign a URL
 * for without a real account to ask.
 */
const cloud = process.env.CLOUDINARY_CLOUD_NAME!;
const apiKey = process.env.CLOUDINARY_API_KEY!;
const apiSecret = process.env.CLOUDINARY_API_SECRET!;
const live = cloud !== "standin-no-cloudinary";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function uploadAuthenticated(publicId: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  // Every param sent must be in the signed string, sorted - same algorithm
  // as src/lib/cloudinary.ts's sign(), just inlined so this test does not
  // depend on the module under test for its own fixture setup.
  const toSign = `public_id=${publicId}&timestamp=${timestamp}&type=authenticated`;
  const signature = createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");
  const body = new URLSearchParams({
    file: PNG,
    public_id: publicId,
    timestamp,
    type: "authenticated",
    api_key: apiKey,
    signature,
  });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body });
  expect(res.status, await res.clone().text()).toBe(200);
}

async function latestAudit(action: string, subjectId: string) {
  const [row] = await q<{ actor_id: string | null; at: Date }>(
    `select actor_id, at from pw_audit_log
     where action = $1 and subject_id = $2
     order by at desc limit 1`,
    [action, subjectId]
  );
  return row;
}

afterAll(purgeTestData);

describe.skipIf(!live)("Identity document access (SEC-2.08)", () => {
  it("owner, admin, and a stranger: signed URL resolves, is gated, and is audited", async () => {
    const owner = await makeUser();
    const admin = await makeUser("admin");
    const stranger = await makeUser();

    const docId = `artwall/betest/idv_${Date.now()}`;
    await uploadAuthenticated(docId);

    const verificationId = tid("idv");
    await q(
      `insert into pw_identity_verifications (id, user_id, doc_cloudinary_id, doc_kind) values ($1, $2, $3, 'pan')`,
      [verificationId, owner.id, docId]
    );

    // A stranger (not the owner, not an admin) is refused.
    actAs(stranger);
    const strangerResult = await getIdentityDocumentUrl(verificationId);
    expect(strangerResult.ok).toBe(false);

    // The owner gets a signed URL that actually resolves to the document.
    actAs(owner);
    const ownerResult = await getIdentityDocumentUrl(verificationId);
    expect(ownerResult.ok).toBe(true);
    if (ownerResult.ok) {
      expect(ownerResult.data.url).toMatch(/^https:\/\/.*cloudinary\.com\//);
      const fetched = await fetch(ownerResult.data.url);
      expect(fetched.status).toBe(200);
    }

    // An admin (the identity-review role in this codebase) also gets one.
    actAs(admin);
    const adminResult = await getIdentityDocumentUrl(verificationId);
    expect(adminResult.ok).toBe(true);

    // A tampered signature on an otherwise-valid URL is rejected by
    // Cloudinary itself (its /download redirect endpoint), not merely by our
    // own code: flip the signature param's value, leave everything else.
    if (ownerResult.ok) {
      const tamperedUrl = new URL(ownerResult.data.url);
      expect(tamperedUrl.searchParams.get("signature")).toBeTruthy();
      tamperedUrl.searchParams.set("signature", "0".repeat(40));
      const bad = await fetch(tamperedUrl.toString());
      expect(bad.status).not.toBe(200);
    }

    // Both successful accesses (owner, admin) are audit-logged.
    const ownerAudit = await latestAudit("identity.document-viewed", verificationId);
    expect(ownerAudit).toBeTruthy();
    expect(ownerAudit.at).toBeInstanceOf(Date);

    const rows = await q<{ actor_id: string }>(
      `select actor_id from pw_audit_log where action = 'identity.document-viewed' and subject_id = $1 order by at asc`,
      [verificationId]
    );
    const actorIds = rows.map((r) => r.actor_id);
    expect(actorIds).toContain(owner.id);
    expect(actorIds).toContain(admin.id);
    // The refused stranger attempt must not have written an audit row.
    expect(actorIds).not.toContain(stranger.id);
  });
});
