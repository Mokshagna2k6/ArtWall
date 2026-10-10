-- ArtWall — survey "Other" free-text escape hatch
--
-- The pain-point survey offered a closed checkbox list per role with no way
-- to say something that isn't on it. Every role's list now ends with a
-- "Something else" option; this column holds what that means. Nullable and
-- additive, so every row submitted before this migration still reads fine
-- with other_pain_point_detail simply null.
alter table survey_responses
  add column if not exists other_pain_point_detail text;
