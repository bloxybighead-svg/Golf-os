-- Hole-by-hole scores for a round. The round's summary stats (fairways %,
-- GIR %, miss left/right %, putts, 3-putts, up-and-downs, penalties, score,
-- par) are computed from these rows when the round is saved
-- (lib/rounds/holes.ts), so nothing has to be typed in from elsewhere.
-- Rounds logged before this table (or as score only) simply have no rows.
-- Owner-only, same pattern as rounds/golfer_baseline.
create table if not exists public.round_holes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hole_number smallint not null check (hole_number between 1 and 18),
  par smallint not null check (par between 3 and 6),
  strokes smallint not null check (strokes between 1 and 20),
  fairway_hit boolean,                                              -- null on par 3s, or not recorded
  fairway_miss_side text check (fairway_miss_side in ('left', 'right')),
  green_hit boolean,                                                -- null when not recorded
  green_miss_side text check (green_miss_side in ('left', 'right', 'long', 'short')),
  putts smallint check (putts between 0 and 10),                    -- null when not recorded
  penalty boolean not null default false,
  created_at timestamptz not null default now(),
  unique (round_id, hole_number)
);

create index if not exists round_holes_round_id_idx on public.round_holes (round_id);

alter table public.round_holes enable row level security;
create policy "select own round_holes" on public.round_holes for select using (auth.uid() = user_id);
create policy "insert own round_holes" on public.round_holes for insert with check (
  auth.uid() = user_id and exists (select 1 from public.rounds r where r.id = round_id and r.user_id = auth.uid())
);
create policy "update own round_holes" on public.round_holes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own round_holes" on public.round_holes for delete using (auth.uid() = user_id);
