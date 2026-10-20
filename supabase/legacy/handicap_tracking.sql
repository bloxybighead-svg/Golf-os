-- Applied to project clgjzoedmtguchilmkdj (migration: handicap_tracking).
-- Per-user handicap history: one row per calculation (or manual entry), so the
-- dashboard can show a "calculated on <date>" snapshot instead of recomputing
-- from scratch on every page load. Owner-only, same pattern as rounds/milestones.
create table if not exists public.handicap_tracking (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  handicap_index numeric(4, 1) not null,
  source text not null check (source in ('manual', 'calculated')),
  calculation_date timestamptz not null default now(),
  rounds_used integer,   -- how many differentials fed a 'calculated' row; null for 'manual'
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, calculation_date)
);

create index if not exists handicap_tracking_user_id_idx on public.handicap_tracking (user_id, calculation_date desc);

alter table public.handicap_tracking enable row level security;
create policy "select own handicap_tracking" on public.handicap_tracking for select using (auth.uid() = user_id);
create policy "insert own handicap_tracking" on public.handicap_tracking for insert with check (auth.uid() = user_id);
create policy "delete own handicap_tracking" on public.handicap_tracking for delete using (auth.uid() = user_id);

-- rounds: snapshot of the golfer's handicap index at the time the round was
-- saved (from the most recent handicap_tracking row, filled in server-side on
-- save), and an is_9_hole flag derived from holes_played so it can never
-- drift out of sync with the column it's derived from.
alter table public.rounds add column if not exists handicap_index numeric(4, 1);
alter table public.rounds add column if not exists is_9_hole boolean generated always as (holes_played = 9) stored;
