-- 0051: one submission per uploaded photo (BE-2.07).
--
-- A double-click, a replayed form or a second tab used to create a second
-- pending row for the same Cloudinary asset, so moderators reviewed it twice
-- and approving both put it in the gallery twice. The asset id is the natural
-- key; submitUgc turns the violation into "already submitted".
create unique index if not exists pw_ugc_submissions_cloudinary_uidx
  on pw_ugc_submissions (cloudinary_id);
