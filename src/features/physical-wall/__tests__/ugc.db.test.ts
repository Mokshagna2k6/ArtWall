import { afterAll, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeUser, purgeTestData, q } from "@/test/fixtures";
import { submitUgc } from "@/features/physical-wall/actions/ugc";

const cloud = process.env.CLOUDINARY_CLOUD_NAME ?? "efgleg53";

function form(publicId: string, caption: string, url?: string) {
  const f = new FormData();
  f.set("caption", caption);
  f.set("cloudinaryId", publicId);
  f.set("imageUrl", url ?? `https://res.cloudinary.com/${cloud}/image/upload/v1700000000/${publicId}.jpg`);
  f.set("consent", "on");
  f.set("adultConfirmed", "on");
  return f;
}

afterAll(purgeTestData);

describe("submitUgc (BE-1.05)", () => {
  it("guest submission stores the real cloudinary public id, not the URL", async () => {
    actAs(null);
    const publicId = `artwall/ugc/betest_${Date.now()}`;
    const result = await submitUgc({ status: "idle" } as never, form(publicId, "betest guest"));
    expect(result.status).toBe("ok");

    const [row] = await q<{ cloudinary_id: string; url: string; consent_id: string; status: string }>(
      `select cloudinary_id, url, consent_id, status from pw_ugc_submissions where caption = 'betest guest'`
    );
    expect(row.cloudinary_id).toBe(publicId);
    expect(row.url).toContain(publicId);
    expect(row.status).toBe("pending");
    const [consent] = await q<{ purpose: string }>(`select purpose from pw_consents where id = $1`, [row.consent_id]);
    expect(consent.purpose).toBe("ugc_publication");
  });

  it("signed-in submitter is linked, and their consent is reused on a second submission", async () => {
    const user = await makeUser();
    actAs(user);
    expect((await submitUgc({ status: "idle" } as never, form(`artwall/ugc/betest_a${Date.now()}`, "betest u1"))).status).toBe("ok");
    expect((await submitUgc({ status: "idle" } as never, form(`artwall/ugc/betest_b${Date.now()}`, "betest u2"))).status).toBe("ok");

    const rows = await q<{ user_id: string; consent_id: string }>(
      `select user_id, consent_id from pw_ugc_submissions where user_id = $1`,
      [user.id]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].consent_id).toBe(rows[1].consent_id);
  });

  it("rejects a URL that is not our Cloudinary asset, or does not match the id", async () => {
    actAs(null);
    const id = `artwall/ugc/betest_c${Date.now()}`;
    const foreign = await submitUgc({ status: "idle" } as never, form(id, "betest bad1", "https://evil.example/x.jpg"));
    expect(foreign.status).toBe("error");
    const mismatch = await submitUgc(
      { status: "idle" } as never,
      form(id, "betest bad2", `https://res.cloudinary.com/${cloud}/image/upload/artwall/ugc/other.jpg`)
    );
    expect(mismatch.status).toBe("error");
    const missingId = form("", "betest bad3");
    expect((await submitUgc({ status: "idle" } as never, missingId)).status).toBe("error");
  });
});
