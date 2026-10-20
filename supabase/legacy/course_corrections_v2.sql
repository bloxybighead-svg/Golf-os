-- course_corrections v2: per-user rows, owner-only RLS, consensus-only sharing.
-- Before: any signed-in account could UPDATE any row (using true) and rewrite user_id, so one
-- bad actor could change a course for everyone. Now:
--   * every user owns their own row per field (unique key includes user_id)
--   * writes go through the submitCorrection server action using the user's session, and RLS
--     only lets a user insert/update/delete rows where auth.uid() = user_id
--   * a correction is applied for EVERYONE only when 2+ distinct users submitted the same value
--     (course_corrections_consensus below); a lone correction applies only to its submitter,
--     whose browser reads their own rows through the owner-only select policy.

-- 1. One row per (course, hole, field, user).
alter table public.course_corrections
  drop constraint if exists course_corrections_course_key_hole_id_field_name_key;
alter table public.course_corrections
  drop constraint if exists course_corrections_user_key;
alter table public.course_corrections
  add constraint course_corrections_user_key unique (course_key, hole_id, field_name, user_id);

alter table public.course_corrections
  add column if not exists updated_at timestamptz not null default now();

-- 2. Value length limits (field_name is already CHECKed to par/tee_lat/tee_lng/yardage/handicap).
alter table public.course_corrections
  drop constraint if exists course_corrections_value_len;
alter table public.course_corrections
  add constraint course_corrections_value_len check (char_length(corrected_value) between 1 and 32);
alter table public.course_corrections
  drop constraint if exists course_corrections_reason_len;
alter table public.course_corrections
  add constraint course_corrections_reason_len check (reason is null or char_length(reason) <= 200);
alter table public.course_corrections
  drop constraint if exists course_corrections_original_len;
alter table public.course_corrections
  add constraint course_corrections_original_len check (original_value is null or char_length(original_value) <= 32);

-- 3. Owner-only policies. The public-read, "authenticated insert" and "authenticated update"
--    policies are gone; other users' rows are no longer readable (consensus goes via the function).
alter table public.course_corrections enable row level security;
drop policy if exists "public read course_corrections" on public.course_corrections;
drop policy if exists "authenticated insert course_corrections" on public.course_corrections;
drop policy if exists "authenticated update course_corrections" on public.course_corrections;
drop policy if exists "owner select course_corrections" on public.course_corrections;
drop policy if exists "owner insert course_corrections" on public.course_corrections;
drop policy if exists "owner update course_corrections" on public.course_corrections;
drop policy if exists "owner delete course_corrections" on public.course_corrections;

create policy "owner select course_corrections" on public.course_corrections
  for select to authenticated using (auth.uid() = user_id);
create policy "owner insert course_corrections" on public.course_corrections
  for insert to authenticated with check (auth.uid() = user_id);
create policy "owner update course_corrections" on public.course_corrections
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner delete course_corrections" on public.course_corrections
  for delete to authenticated using (auth.uid() = user_id);

-- Table privileges: anon reads nothing directly. Signed-in users get SELECT on all columns
-- (user_id included, which upsert's ON CONFLICT needs) but RLS limits them to their own rows.
revoke select on public.course_corrections from anon, authenticated;
grant select on public.course_corrections to authenticated;

-- 4. Consensus: values 2+ distinct users agree on, with no user ids exposed.
--    p_min_users can be raised by a caller but never below 2.
create or replace function public.course_corrections_consensus(p_course_key text, p_min_users int default 2)
returns table (hole_id text, field_name text, corrected_value text, voters int, last_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.hole_id, c.field_name, c.corrected_value,
         count(distinct c.user_id)::int as voters,
         max(c.updated_at) as last_at
  from public.course_corrections c
  where c.course_key = p_course_key
  group by c.hole_id, c.field_name, c.corrected_value
  having count(distinct c.user_id) >= greatest(coalesce(p_min_users, 2), 2)
$$;

revoke all on function public.course_corrections_consensus(text, int) from public;
grant execute on function public.course_corrections_consensus(text, int) to anon, authenticated;
