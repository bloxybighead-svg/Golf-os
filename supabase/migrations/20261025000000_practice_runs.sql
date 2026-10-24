-- Practice session runner: one row per run, one per set saved. Additive; run in the Supabase SQL editor.
-- The phone sends a run whole after every set (upsert on id, sets replaced), so sending it twice is still one run.
create table if not exists public.practice_runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  run_date date not null,
  location text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null check (status in ('running', 'completed', 'ended_early')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists practice_runs_user_idx on public.practice_runs (user_id, started_at desc);

-- A skipped set has skipped = true and value null, never 0.
create table if not exists public.practice_run_sets (
  run_id uuid not null references public.practice_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_index integer not null,
  block_index integer not null,
  drill_id uuid not null references public.drill_library(id),
  label text not null,
  club text,
  skipped boolean not null default false,
  value numeric,
  attempts integer,
  spread jsonb,
  saved_at timestamptz not null,
  primary key (run_id, step_index),
  check (not skipped or value is null)
);

alter table public.practice_runs enable row level security;
create policy "select own practice_runs" on public.practice_runs for select using ((select auth.uid()) = user_id);
create policy "insert own practice_runs" on public.practice_runs for insert with check ((select auth.uid()) = user_id);
create policy "update own practice_runs" on public.practice_runs for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own practice_runs" on public.practice_runs for delete using ((select auth.uid()) = user_id);

alter table public.practice_run_sets enable row level security;
create policy "select own practice_run_sets" on public.practice_run_sets for select using ((select auth.uid()) = user_id);
create policy "insert own practice_run_sets" on public.practice_run_sets for insert with check ((select auth.uid()) = user_id);
create policy "update own practice_run_sets" on public.practice_run_sets for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own practice_run_sets" on public.practice_run_sets for delete using ((select auth.uid()) = user_id);
