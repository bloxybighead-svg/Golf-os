-- Privacy fix for public.course_corrections.
-- The table has a public SELECT policy (using true) and the anon key ships in the browser,
-- so submitted_by (an email) and user_id were readable by anyone.
-- 1) Remove the email. 2) Column-level SELECT so user_id/original_value/reason are not public.
-- Writes are unaffected: INSERT/UPDATE privileges and policies are unchanged, and the upsert's
-- ON CONFLICT target (course_key, hole_id, field_name) is within the granted columns.
update public.course_corrections set submitted_by = null where submitted_by is not null;
alter table public.course_corrections drop column if exists submitted_by;

revoke select on public.course_corrections from anon, authenticated;
grant select (course_key, hole_id, field_name, corrected_value, created_at)
  on public.course_corrections to anon, authenticated;
