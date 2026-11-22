import { afterAll, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeArtwork, makeBooking, makeSlots, makeUser, purgeTestData, q } from "@/test/fixtures";
import { addConditionPhoto, recordDamage } from "@/features/physical-wall/actions/condition";
import { listAllBookings } from "@/features/physical-wall/data/bookings";

afterAll(purgeTestData);

const cloud = process.env.CLOUDINARY_CLOUD_NAME ?? "efgleg53";

function photoForm(bookingId: string, stage: string, itemKey: string, publicId = `artwall/condition/betest_${Date.now()}_${itemKey}`) {
  const f = new FormData();
  f.set("bookingId", bookingId);
  f.set("stage", stage);
  f.set("itemKey", itemKey);
  f.set("cloudinaryId", publicId);
  f.set("url", `https://res.cloudinary.com/${cloud}/image/upload/v1/${publicId}.jpg`);
  return f;
}

describe("condition reports (BE-1.36 / 1.37)", () => {
  it("staff record install + de-install photos and damage linked to booking and artwork; admin view reads them", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);
    const slots = await makeSlots(1);
    const bk = await makeBooking(artist.id, slots, { status: "paid" });
    await q(`update pw_bookings set artwork_id = $2 where id = $1`, [bk, art]);

    actAs(artist);
    expect((await addConditionPhoto({ status: "idle" } as never, photoForm(bk, "install", "frame"))).status).toBe("error");

    actAs(await makeUser("staff"));
    const install = await addConditionPhoto({ status: "idle" } as never, photoForm(bk, "install", "frame"));
    expect(install.status).toBe("ok");
    expect((await addConditionPhoto({ status: "idle" } as never, photoForm(bk, "deinstall", "frame"))).status).toBe("ok");
    expect((await addConditionPhoto({ status: "idle" } as never, photoForm(bk, "later", "frame"))).status).toBe("error");
    const foreign = photoForm(bk, "install", "frame");
    foreign.set("url", "https://evil.example/x.jpg");
    expect((await addConditionPhoto({ status: "idle" } as never, foreign)).status).toBe("error");

    const photoId = (install as { data: { id: string } }).data.id;
    const dmg = new FormData();
    dmg.set("bookingId", bk);
    dmg.set("itemKey", "frame");
    dmg.set("description", "Corner chipped in transit");
    dmg.set("severity", "major");
    dmg.set("photoId", photoId);
    expect((await recordDamage({ status: "idle" } as never, dmg)).status).toBe("ok");

    const [row] = await q<{ artwork_id: string; photo_id: string }>(
      `select artwork_id, photo_id from pw_damage_records where booking_id = $1`,
      [bk]
    );
    expect(row).toEqual({ artwork_id: art, photo_id: photoId });

    const view = (await listAllBookings()).find((b) => b.id === bk);
    expect(view?.condition?.photos.map((p) => p.stage).sort()).toEqual(["deinstall", "install"]);
    expect(view?.condition?.damage[0]).toMatchObject({ severity: "major", artworkId: art });
  });
});
