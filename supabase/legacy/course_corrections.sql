-- Applied to project clgjzoedmtguchilmkdj (migration: course_corrections).
-- Golfer-submitted fixes for wrong course data from OpenGolfAPI/OpenStreetMap
-- (e.g. a hole tagged the wrong par). Global and shared, same as the spec asked --
-- but keyed by hole_id (the stable OSM way id already used everywhere else in this
-- app as CourseHole.id), not hole_number: a hole's OSM `ref` tag can be missing or
-- ambiguous, while its way id is exactly what /api/courses/geometry and the planner
-- already use to identify a hole, so this reuses an existing stable key instead of
-- introducing a second, weaker one.
--
-- Any signed-in user can submit OR overwrite an existing correction (no per-user
-- ownership, no moderation) -- deliberate, matches the spec's own "no admin/review
-- yet, expect occasional noise" scope. Revisit if this gets abused; there is no
-- review queue yet, only a straight overwrite.
create table if not exists public.course_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- submitted_by (email) was dropped by course_corrections_privacy.sql: public SELECT leaked it.
  course_key text not null,             -- same key as course_geometry.course_key ("ogapi:<id>")
  hole_id text not null,                -- CourseHole.id
  field_name text not null check (field_name in ('par', 'tee_lat', 'tee_lng', 'yardage', 'handicap')),
  original_value text,
  corrected_value text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (course_key, hole_id, field_name)
);

create index if not exists course_corrections_course_idx on public.course_corrections (course_key);

alter table public.course_corrections enable row level security;

drop policy if exists "public read course_corrections" on public.course_corrections;
create policy "public read course_corrections" on public.course_corrections
  for select to anon, authenticated using (true);

drop policy if exists "authenticated insert course_corrections" on public.course_corrections;
create policy "authenticated insert course_corrections" on public.course_corrections
  for insert to authenticated with check (auth.uid() = user_id);

-- Open (not owner-only) so a later submission can overwrite an earlier one via
-- upsert on the (course_key, hole_id, field_name) unique key, matching "global,
-- shared, latest wins" from the spec -- this is not personal data like course_zones.
drop policy if exists "authenticated update course_corrections" on public.course_corrections;
create policy "authenticated update course_corrections" on public.course_corrections
  for update to authenticated using (true) with check (true);
