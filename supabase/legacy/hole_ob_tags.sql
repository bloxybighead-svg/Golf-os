-- Session 13b. NOT YET APPLIED: run this in the Supabase SQL editor.
-- Out-of-bounds tags per hole: "OB left / right / long" (or "none": the golfer
-- confirmed there is no OB on this hole), saved per signed-in user per course
-- and hole. The planner turns each tag into an out-of-bounds zone along that
-- side of the hole (lib/course/obTags.ts). Owner-only RLS, same four policies as
-- course_zones.sql / per_user_data.sql. Signed-out golfers keep tags on their
-- device (localStorage), like hand-drawn marks.
create table if not exists public.hole_ob_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,       -- OpenGolfAPI course id, as in course_zones
  hole_id text not null,         -- the hole's OSM way id (CourseHole.id), as in course_corrections
  side text not null check (side in ('left', 'right', 'long', 'none')),
  margin_yds numeric not null default 15 check (margin_yds between 0 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_id, hole_id, side)
);

create index if not exists hole_ob_tags_user_course_idx on public.hole_ob_tags (user_id, course_id);

alter table public.hole_ob_tags enable row level security;

drop policy if exists "select own hole_ob_tags" on public.hole_ob_tags;
create policy "select own hole_ob_tags" on public.hole_ob_tags
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "insert own hole_ob_tags" on public.hole_ob_tags;
create policy "insert own hole_ob_tags" on public.hole_ob_tags
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "update own hole_ob_tags" on public.hole_ob_tags;
create policy "update own hole_ob_tags" on public.hole_ob_tags
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own hole_ob_tags" on public.hole_ob_tags;
create policy "delete own hole_ob_tags" on public.hole_ob_tags
  for delete to authenticated using (auth.uid() = user_id);
