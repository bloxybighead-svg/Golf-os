-- Applied to project clgjzoedmtguchilmkdj (migration: golfer_baseline).
-- A golfer's starting numbers from setup (/welcome): handicap, how far they
-- carry each club they gave, and their home course. One row per user; the
-- Play planner builds their shots from it on any device they sign in on.
-- Owner-only, same pattern as rounds/milestones.
create table if not exists public.golfer_baseline (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handicap_index numeric(4, 1),
  carries jsonb not null default '{}'::jsonb,  -- {"Driver": 250, "7-Iron": 155, ...} in yards
  home_course jsonb,                           -- {id, name, city, state, par, lat, lng} from course search
  updated_at timestamptz not null default now()
);

alter table public.golfer_baseline enable row level security;
create policy "select own golfer_baseline" on public.golfer_baseline for select using (auth.uid() = user_id);
create policy "insert own golfer_baseline" on public.golfer_baseline for insert with check (auth.uid() = user_id);
create policy "update own golfer_baseline" on public.golfer_baseline for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own golfer_baseline" on public.golfer_baseline for delete using (auth.uid() = user_id);
