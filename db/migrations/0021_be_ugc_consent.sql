-- 0021: let an anonymous guest's UGC consent be recorded.
--
-- submitUgc records a pw_consents row for every submission (pw_ugc_submissions
-- .consent_id is not null). The subject check demanded exactly one of user_id /
-- visitor_id, but most selfie submitters are walk-in guests with neither — so
-- every guest submission failed. A subject-less consent is now allowed only for
-- 'ugc_publication', where the submission row itself is what the consent is
-- about (withdrawal = withdrawUgc on that submission).

alter table pw_consents drop constraint if exists pw_consents_subject_check;
alter table pw_consents add constraint pw_consents_subject_check check (
  (user_id is not null and visitor_id is null) or
  (user_id is null and visitor_id is not null) or
  (user_id is null and visitor_id is null and purpose = 'ugc_publication')
);
