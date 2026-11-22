import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { actAs, setTestCookie } from "@/test/db-setup";
import { makeUser, purgeTestData, q, RUN } from "@/test/fixtures";
import { submitUgc, withdrawUgc } from "@/features/physical-wall/actions/ugc";
import { requestUgcUploadSignature } from "@/features/physical-wall/actions/upload";
import { UGC_GUEST_COOKIE } from "@/features/physical-wall/image-validation";

const cloud = process.env.CLOUDINARY_CLOUD_NAME!;
let n = 0;
const caption = (label: string) => `betest ${RUN} ${label}`;

function form(publicId: string, text: string, opts: { url?: string; ext?: string } = {}) {
  const f = new FormData();
  f.set("caption", text);
  f.set("cloudinaryId", publicId);
  f.set("imageUrl", opts.url ?? `https://res.cloudinary.com/${cloud}/image/upload/v1700000000/${publicId}.${opts.ext ?? "jpg"}`);
  f.set("consent", "on");
  f.set("adultConfirmed", "on");
  return f;
}

/** What the browser gets from the signature route: its folder (and, for a guest, a cookie). */
async function sign() {
  const res = await requestUgcUploadSignature();
  if (!res.ok) throw new Error(res.message);
  return res.signature;
}
const photo = (folder: string) => `${folder}/betest_${RUN}_${Date.now()}_${n++}`;
const submit = (f: FormData) => submitUgc({ status: "idle" } as never, f);
const msg = (r: Awaited<ReturnType<typeof submit>>) => (r.status === "idle" ? "" : r.message);

afterAll(purgeTestData);
beforeEach(() => {
  actAs(null);
  setTestCookie(UGC_GUEST_COOKIE, null);
});

describe("UGC upload signature (BE-2.08)", () => {
  it("signs a per-uploader folder restricted to image formats; a guest gets an httpOnly cookie", async () => {
    const guest = await sign();
    expect(guest.folder).toMatch(/^artwall\/ugc\/[A-Za-z0-9_-]{24}$/);
    expect(guest.allowedFormats).toBe("jpg,jpeg,png,webp,heic,gif");
    // Same cookie → same folder; a new visitor → a different one.
    expect((await sign()).folder).toBe(guest.folder);
    setTestCookie(UGC_GUEST_COOKIE, null);
    expect((await sign()).folder).not.toBe(guest.folder);

    actAs(await makeUser());
    const userFolder = (await sign()).folder;
    actAs(await makeUser());
    expect((await sign()).folder).not.toBe(userFolder);
  });
});

describe("submitUgc (BE-2.07 / 2.08)", () => {
  it("valid guest submission stores the public id, the URL and a ugc_publication consent", async () => {
    const id = photo((await sign()).folder);
    const r = await submit(form(id, caption("guest")));
    expect(r.status, msg(r)).toBe("ok");
    const [row] = await q<{ cloudinary_id: string; url: string; consent_id: string; status: string }>(
      `select cloudinary_id, url, consent_id, status from pw_ugc_submissions where cloudinary_id = $1`,
      [id]
    );
    expect(row).toMatchObject({ cloudinary_id: id, status: "pending" });
    expect(row.url).toContain(id);
    const [consent] = await q<{ purpose: string }>(`select purpose from pw_consents where id = $1`, [row.consent_id]);
    expect(consent.purpose).toBe("ugc_publication");
  });

  it("signed-in submitter is linked, and their consent is reused across submissions", async () => {
    const user = await makeUser();
    actAs(user);
    const folder = (await sign()).folder;
    expect((await submit(form(photo(folder), caption("u1")))).status).toBe("ok");
    expect((await submit(form(photo(folder), caption("u2")))).status).toBe("ok");
    const rows = await q<{ consent_id: string }>(`select consent_id from pw_ugc_submissions where user_id = $1`, [user.id]);
    expect(rows).toHaveLength(2);
    expect(rows[0].consent_id).toBe(rows[1].consent_id);
  });

  it("missing cloudinaryId is rejected before anything is stored", async () => {
    await sign();
    const r = await submit(form("", caption("noid")));
    expect(r).toEqual({ status: "error", message: "Upload a photo first." });
  });

  it("oversized caption (501 chars) is rejected; 500 is fine", async () => {
    const folder = (await sign()).folder;
    const long = await submit(form(photo(folder), `betest ${"x".repeat(494)}`));
    expect(msg(long)).toBe("Keep the caption under 500 characters.");
    const ok = await submit(form(photo(folder), `betest ${"x".repeat(493)}`));
    expect(ok.status, msg(ok)).toBe("ok");
  });

  it("rejected image types: a PDF, an SVG or an extensionless URL is refused", async () => {
    const folder = (await sign()).folder;
    for (const ext of ["pdf", "svg", "exe"]) {
      expect(msg(await submit(form(photo(folder), caption(ext), { ext }))), ext).toMatch(/file type/);
    }
    const id = photo(folder);
    const bare = `https://res.cloudinary.com/${cloud}/image/upload/v1/${id}`;
    expect((await submit(form(id, caption("bare"), { url: bare }))).status).toBe("error");
  });

  it("duplicate submission of the same photo, sequential or concurrent, stores one row", async () => {
    const folder = (await sign()).folder;
    const id = photo(folder);
    expect((await submit(form(id, caption("dup1")))).status).toBe("ok");
    expect(msg(await submit(form(id, caption("dup2"))))).toBe("That photo has already been submitted.");

    const id2 = photo(folder);
    const burst = await Promise.all([1, 2, 3].map((i) => submit(form(id2, caption(`burst${i}`)))));
    expect(burst.filter((r) => r.status === "ok")).toHaveLength(1);
    expect(await q(`select 1 from pw_ugc_submissions where cloudinary_id = any($1)`, [[id, id2]])).toHaveLength(2);
  });

  it("cannot claim someone else's upload: other user, other guest, the shared folder, a foreign URL", async () => {
    const alice = await makeUser();
    actAs(alice);
    const alicePhoto = photo((await sign()).folder);

    actAs(await makeUser()); // Bob, signed in, with Alice's public id
    await sign();
    expect(msg(await submit(form(alicePhoto, caption("bob"))))).toMatch(/did not come from our uploader/);

    actAs(null); // a guest with their own cookie
    await sign();
    expect((await submit(form(alicePhoto, caption("guest-steal")))).status).toBe("error");

    setTestCookie(UGC_GUEST_COOKIE, null); // no session, no cookie: owns no folder
    expect((await submit(form(alicePhoto, caption("nobody")))).status).toBe("error");

    const guestFolder = (await sign()).folder;
    expect((await submit(form(`artwall/ugc/betest_${RUN}_flat`, caption("flat")))).status).toBe("error");
    const mine = photo(guestFolder);
    expect((await submit(form(mine, caption("foreign"), { url: "https://evil.example/x.jpg" }))).status).toBe("error");
    const otherAsset = `https://res.cloudinary.com/${cloud}/image/upload/v1/${guestFolder}/other.jpg`;
    expect((await submit(form(mine, caption("mismatch"), { url: otherAsset }))).status).toBe("error");

    // Alice herself is fine.
    actAs(alice);
    expect((await submit(form(alicePhoto, caption("alice")))).status).toBe("ok");
  });

  it("only the submitter or staff can withdraw a submission", async () => {
    const owner = await makeUser();
    actAs(owner);
    const id = photo((await sign()).folder);
    await submit(form(id, caption("withdraw")));
    const [{ id: submissionId }] = await q<{ id: string }>(`select id from pw_ugc_submissions where cloudinary_id = $1`, [id]);
    const withdraw = () => {
      const f = new FormData();
      f.set("submissionId", submissionId);
      return withdrawUgc({ status: "idle" } as never, f);
    };

    actAs(await makeUser());
    expect((await withdraw()).status).toBe("error");
    actAs(null);
    await sign();
    expect((await withdraw()).status).toBe("error");

    actAs(owner);
    expect((await withdraw()).status).toBe("ok");
    const [row] = await q<{ withdrawn_at: string | null }>(`select withdrawn_at from pw_ugc_submissions where id = $1`, [submissionId]);
    expect(row.withdrawn_at).not.toBeNull();
  });
});
