-- Shots recorded during a round: where the ball was, where it went, with which
-- club. Swing shots are recorded on Play as the ball moves; putts come from the
-- hole's score (the first putt runs from the approach finish to the pin, the
-- rest have no positions). Owner-only, same pattern as round_holes.
-- Penalty strokes are extra strokes taken by that shot (water, OB).
-- Run in the Supabase SQL editor.
create table if not exists public.round_shots (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hole_number smallint not null check (hole_number between 1 and 18),
  shot_number smallint not null check (shot_number between 1 and 30),
  club text not null,
  from_lat double precision,
  from_lng double precision,
  from_lie text not null check (from_lie in ('tee', 'fairway', 'rough', 'bunker', 'green', 'trees', 'water', 'oob')),
  to_lat double precision,
  to_lng double precision,
  to_lie text not null check (to_lie in ('fairway', 'rough', 'bunker', 'green', 'trees', 'water', 'oob', 'holed')),
  penalty_strokes smallint not null default 0 check (penalty_strokes between 0 and 4),
  created_at timestamptz not null default now(),
  unique (round_id, hole_number, shot_number)
);

create index if not exists round_shots_user_id_idx on public.round_shots (user_id);
create index if not exists round_shots_round_id_idx on public.round_shots (round_id);

alter table public.round_shots enable row level security;
create policy "select own round_shots" on public.round_shots for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own round_shots" on public.round_shots for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (select 1 from public.rounds r where r.id = round_id and r.user_id = (select auth.uid()))
);
create policy "update own round_shots" on public.round_shots for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own round_shots" on public.round_shots for delete to authenticated using ((select auth.uid()) = user_id);
