-- Session 0: auth foundation for the remaining personal-data tables.
-- Mirrors the pattern already applied to course_zones: user_id + owner-only RLS.

-- STEP 1: add user_id columns (nullable for now, filled in step 2)
alter table public.rounds add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.drills add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.practice_sessions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.session_blocks add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.milestones add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- STEP 2: backfill existing rows to Dillon's account (dilloncady@yahoo.com)
update public.rounds set user_id = 'b36e19f7-9a6d-409a-a836-512a9ef88c26' where user_id is null;
update public.drills set user_id = 'b36e19f7-9a6d-409a-a836-512a9ef88c26' where user_id is null;
update public.practice_sessions set user_id = 'b36e19f7-9a6d-409a-a836-512a9ef88c26' where user_id is null;
update public.session_blocks set user_id = 'b36e19f7-9a6d-409a-a836-512a9ef88c26' where user_id is null;
update public.milestones set user_id = 'b36e19f7-9a6d-409a-a836-512a9ef88c26' where user_id is null;

-- STEP 3: require it going forward
alter table public.rounds alter column user_id set not null;
alter table public.drills alter column user_id set not null;
alter table public.practice_sessions alter column user_id set not null;
alter table public.session_blocks alter column user_id set not null;
alter table public.milestones alter column user_id set not null;

create index if not exists rounds_user_id_idx on public.rounds(user_id);
create index if not exists drills_user_id_idx on public.drills(user_id);
create index if not exists practice_sessions_user_id_idx on public.practice_sessions(user_id);
create index if not exists session_blocks_user_id_idx on public.session_blocks(user_id);
create index if not exists milestones_user_id_idx on public.milestones(user_id);

-- STEP 4: enable RLS + owner-only policies
alter table public.rounds enable row level security;
create policy "select own rounds" on public.rounds for select using (auth.uid() = user_id);
create policy "insert own rounds" on public.rounds for insert with check (auth.uid() = user_id);
create policy "update own rounds" on public.rounds for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own rounds" on public.rounds for delete using (auth.uid() = user_id);

alter table public.drills enable row level security;
create policy "select own drills" on public.drills for select using (auth.uid() = user_id);
create policy "insert own drills" on public.drills for insert with check (auth.uid() = user_id);
create policy "update own drills" on public.drills for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own drills" on public.drills for delete using (auth.uid() = user_id);

alter table public.practice_sessions enable row level security;
create policy "select own practice_sessions" on public.practice_sessions for select using (auth.uid() = user_id);
create policy "insert own practice_sessions" on public.practice_sessions for insert with check (auth.uid() = user_id);
create policy "update own practice_sessions" on public.practice_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own practice_sessions" on public.practice_sessions for delete using (auth.uid() = user_id);

alter table public.session_blocks enable row level security;
create policy "select own session_blocks" on public.session_blocks for select using (auth.uid() = user_id);
create policy "insert own session_blocks" on public.session_blocks for insert with check (auth.uid() = user_id);
create policy "update own session_blocks" on public.session_blocks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own session_blocks" on public.session_blocks for delete using (auth.uid() = user_id);

alter table public.milestones enable row level security;
create policy "select own milestones" on public.milestones for select using (auth.uid() = user_id);
create policy "insert own milestones" on public.milestones for insert with check (auth.uid() = user_id);
create policy "update own milestones" on public.milestones for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own milestones" on public.milestones for delete using (auth.uid() = user_id);

-- wedge_reference isn't per-user data (a shared lookup table, currently unused by
-- the app) -- just close the anon-write hole the advisor flagged, same as the
-- other shared reference tables (course_geometry, golfer_profiles, real_shots,
-- simulated_shots): RLS on, world-readable, no client ever writes it.
alter table public.wedge_reference enable row level security;
create policy "public read wedge_reference" on public.wedge_reference for select using (true);
