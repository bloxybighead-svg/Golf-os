-- practice_runs becomes the one place practice history lives. Additive; run in the Supabase SQL editor
-- BEFORE deploying the app change (the app writes the new source column).
-- practice_sessions and user_drills are left in place and no longer read.

-- "logged" is a drill logged by hand; "session" is one played in the runner.
alter table public.practice_runs add column if not exists source text not null default 'session' check (source in ('session', 'logged'));

-- Older practice_sessions: one completed, setless run each, on the same id. Noon UTC keeps the date in every US timezone.
insert into public.practice_runs (id, user_id, run_date, location, started_at, ended_at, status, notes, source)
select
  s.id,
  s.user_id,
  s.date,
  s.session_type,
  (s.date + time '12:00') at time zone 'UTC',
  (s.date + time '12:00') at time zone 'UTC' + make_interval(mins => coalesce(s.duration_minutes, 0)),
  'completed',
  s.notes,
  'logged'
from public.practice_sessions s
on conflict (id) do nothing;

-- user_drills (hand-logged drills): the run, then its one set when it named a drill.
insert into public.practice_runs (id, user_id, run_date, location, started_at, ended_at, status, notes, source)
select
  u.id,
  u.user_id,
  (u.started_at at time zone 'UTC')::date,
  coalesce((select d.locations[1]::text from public.drill_library d where d.id = u.drill_id), 'other'),
  u.started_at,
  u.started_at + make_interval(mins => coalesce(u.minutes, 0)),
  'completed',
  u.notes,
  'logged'
from public.user_drills u
on conflict (id) do nothing;

insert into public.practice_run_sets (run_id, user_id, step_index, block_index, drill_id, label, skipped, value, saved_at)
select u.id, u.user_id, 0, 0, u.drill_id, d.name, false, null, u.started_at
from public.user_drills u
join public.drill_library d on d.id = u.drill_id
on conflict (run_id, step_index) do nothing;
