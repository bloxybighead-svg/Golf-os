-- Applied to project clgjzoedmtguchilmkdj on 2026-09-27 (migration: course_zones_per_user).
-- Hand-drawn course zones (trees/water/bunker/OOB/safe areas the golfer marks on
-- the Course Planner map), saved per signed-in user per course so they carry
-- across devices and accumulate over repeated rounds. Owner-only via RLS: each
-- user can only see and edit their own rows (auth.uid() = user_id).
create table if not exists public.course_zones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,      -- OpenGolfAPI course id, matches the planner's course search results
  lie text not null,            -- water | oob | bunker | green | fairway | trees | rough
  ring jsonb not null,          -- [{lat,lng}, ...] polygon vertices
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_zones_user_course_idx on public.course_zones (user_id, course_id);

alter table public.course_zones enable row level security;

drop policy if exists "select own course_zones" on public.course_zones;
create policy "select own course_zones" on public.course_zones
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "insert own course_zones" on public.course_zones;
create policy "insert own course_zones" on public.course_zones
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "update own course_zones" on public.course_zones;
create policy "update own course_zones" on public.course_zones
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own course_zones" on public.course_zones;
create policy "delete own course_zones" on public.course_zones
  for delete to authenticated using (auth.uid() = user_id);
