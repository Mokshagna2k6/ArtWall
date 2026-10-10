-- 0060: one-time persona choice ("What brings you to ArtWall?") asked after
-- sign-up/first sign-in.
--
-- Studio's layout (src/app/studio/layout.tsx) used to call ensureArtistProfile
-- for ANY signed-in user who reached /studio, with no gate — so a user who
-- clicked around out of curiosity silently became "an artist" (got an
-- artist_profiles row) just by visiting. This column records whether the user
-- has ever been asked, so that first-ever auto-creation can be stopped without
-- touching user.role (an unrelated internal access tier: visitor | artist |
-- staff | admin) or treating "has an artist_profiles / curators row" as a
-- proxy for "was asked" — existing seed/test data already has profile rows
-- created under the old no-gate behaviour, before anyone answered anything.
--
-- Nullable, same convention as ageDeclaredAdult: null means "not yet asked".
-- Backfill: every existing user is left null (not yet asked) EXCEPT those who
-- already have an artist_profiles row - they've already effectively "chosen"
-- artist under the old behaviour, so they're backfilled to 'artist' and will
-- never see the new screen or lose Studio access.

begin;

alter table "user" add column "onboarding_persona" text;

alter table "user" add constraint "user_onboarding_persona_check"
  check ("onboarding_persona" in ('artist', 'curator', 'buyer'));

update "user" set "onboarding_persona" = 'artist'
where "id" in (select "userId" from "artist_profiles");

commit;
