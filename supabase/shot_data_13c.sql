-- Session 13c, step 1 of 3: per-account shot data. ADDITIVE ONLY -- nothing is
-- dropped or changed in a way the live app notices. Run in the Supabase SQL
-- editor (project clgjzoedmtguchilmkdj) AFTER hole_ob_tags.sql and
-- round_holes_penalty_shot.sql (session 13b). Safe to run twice.
--
-- What it adds
--   shot_sessions  one row per upload / practice session (label, date,
--                  indoor|outdoor, mat|grass, excluded)
--   shot_profiles  one fitted profile per club per user (the fit itself runs in
--                  the browser: lib/golfer/shotProfile.ts)
--   real_shots     + user_id, + session_id; golfer_name becomes optional (legacy
--                  rows keep theirs)
-- Every table is owner-only (auth.uid() = user_id), the pattern in
-- per_user_data.sql. The old "public read real_shots" policy is NOT touched
-- here; shot_data_13c_lockdown.sql removes it once the new code is live.

create table if not exists public.shot_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,
  session_date date,
  environment text not null default 'outdoor' check (environment in ('indoor', 'outdoor')),
  surface text not null default 'grass' check (surface in ('mat', 'grass')),
  excluded boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists shot_sessions_user_id_idx on public.shot_sessions(user_id);

create table if not exists public.shot_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  club text not null,
  params jsonb not null,           -- calibrate.ts FittedProfile (+ mat_indoor_only)
  n_shots integer not null,
  sessions_used integer not null,
  fitted_at timestamptz not null default now(),
  unique (user_id, club)
);
create index if not exists shot_profiles_user_id_idx on public.shot_profiles(user_id);

alter table public.real_shots add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.real_shots add column if not exists session_id uuid references public.shot_sessions(id) on delete cascade;
alter table public.real_shots alter column golfer_name drop not null;
create index if not exists real_shots_user_session_idx on public.real_shots(user_id, session_id);

-- shot_sessions
alter table public.shot_sessions enable row level security;
drop policy if exists "select own shot_sessions" on public.shot_sessions;
drop policy if exists "insert own shot_sessions" on public.shot_sessions;
drop policy if exists "update own shot_sessions" on public.shot_sessions;
drop policy if exists "delete own shot_sessions" on public.shot_sessions;
create policy "select own shot_sessions" on public.shot_sessions for select using (auth.uid() = user_id);
create policy "insert own shot_sessions" on public.shot_sessions for insert with check (auth.uid() = user_id);
create policy "update own shot_sessions" on public.shot_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own shot_sessions" on public.shot_sessions for delete using (auth.uid() = user_id);

-- shot_profiles
alter table public.shot_profiles enable row level security;
drop policy if exists "select own shot_profiles" on public.shot_profiles;
drop policy if exists "insert own shot_profiles" on public.shot_profiles;
drop policy if exists "update own shot_profiles" on public.shot_profiles;
drop policy if exists "delete own shot_profiles" on public.shot_profiles;
create policy "select own shot_profiles" on public.shot_profiles for select using (auth.uid() = user_id);
create policy "insert own shot_profiles" on public.shot_profiles for insert with check (auth.uid() = user_id);
create policy "update own shot_profiles" on public.shot_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own shot_profiles" on public.shot_profiles for delete using (auth.uid() = user_id);

-- real_shots: owner policies. A shot may only join a session its owner owns.
drop policy if exists "select own real_shots" on public.real_shots;
drop policy if exists "insert own real_shots" on public.real_shots;
drop policy if exists "update own real_shots" on public.real_shots;
drop policy if exists "delete own real_shots" on public.real_shots;
create policy "select own real_shots" on public.real_shots for select using (auth.uid() = user_id);
create policy "insert own real_shots" on public.real_shots for insert with check (
  auth.uid() = user_id
  and (session_id is null or exists (select 1 from public.shot_sessions s where s.id = session_id and s.user_id = auth.uid()))
);
create policy "update own real_shots" on public.real_shots for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and (session_id is null or exists (select 1 from public.shot_sessions s where s.id = session_id and s.user_id = auth.uid()))
);
create policy "delete own real_shots" on public.real_shots for delete using (auth.uid() = user_id);
