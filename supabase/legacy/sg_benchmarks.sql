-- Applied to project clgjzoedmtguchilmkdj (migrations: sg_benchmarks, round_analysis).
--
-- This app's Rounds feature only ever logs box-score stats per round
-- (fairways%, GIR%, total putts, up-and-downs) -- never per-shot distance/lie
-- data. Real strokes-gained (Broadie/ShotLink-style) requires the latter, so
-- sg_benchmarks/round_analysis hold a documented PROXY, not measured SG. See
-- lib/sgBenchmarks.ts for the full formula; summary:
--   - Every bracket's typical fairways%/GIR%/putts-per-18/up-and-down% was
--     researched from public handicap-stat breakdowns (breakxgolf.com,
--     mygolfspy.com, practical-golf.com, 2026) -- real numbers, not invented.
--   - Converting those stat gaps into a strokes value uses per-event
--     stroke-cost estimates (missed fairway ~0.2, missed green ~0.5, failed
--     up-and-down ~0.5 strokes) reasoned from published ranges for those
--     events, not independently measured for this app -- swap for a measured
--     value if this app ever tracks shot-level data. Putting is the one exact
--     category: a putt literally is a stroke, so its number is a real count
--     of putts taken vs. the scratch-bracket average, not an estimate.
-- Every avg_strokes_gained value below is measured against the (0,2] bracket
-- as the zero reference point, using that same formula -- see
-- lib/sgBenchmarks.ts's test file for the worked arithmetic.
create table if not exists public.sg_benchmarks (
  id uuid primary key default gen_random_uuid(),
  handicap_low numeric(4, 1) not null,
  handicap_high numeric(4, 1) not null,
  category text not null check (category in ('off_tee', 'approach', 'short_game', 'putting')),
  avg_strokes_gained numeric(4, 2) not null,
  sample_size integer,          -- left null: no real sample backs these estimates, see header
  data_source text,
  created_at timestamptz not null default now(),
  unique (handicap_high, category)
);

create index if not exists sg_benchmarks_bracket_idx on public.sg_benchmarks (handicap_high);

-- Public read (reference data, same as golfer_profiles/course_geometry) --
-- seeded/maintained only through migrations, no client write path.
alter table public.sg_benchmarks enable row level security;
create policy "public read sg_benchmarks" on public.sg_benchmarks for select to anon, authenticated using (true);

insert into public.sg_benchmarks (handicap_low, handicap_high, category, avg_strokes_gained, data_source) values
  (0, 2, 'off_tee', 0.00, 'amateur_avg'),
  (0, 2, 'approach', 0.00, 'amateur_avg'),
  (0, 2, 'short_game', 0.00, 'amateur_avg'),
  (0, 2, 'putting', 0.00, 'amateur_avg'),
  (2, 5, 'off_tee', -0.15, 'amateur_avg'),
  (2, 5, 'approach', -0.80, 'amateur_avg'),
  (2, 5, 'short_game', -0.60, 'amateur_avg'),
  (2, 5, 'putting', -2.00, 'amateur_avg'),
  (5, 10, 'off_tee', -0.20, 'amateur_avg'),
  (5, 10, 'approach', -1.59, 'amateur_avg'),
  (5, 10, 'short_game', -0.85, 'amateur_avg'),
  (5, 10, 'putting', -3.00, 'amateur_avg'),
  (10, 15, 'off_tee', -0.24, 'amateur_avg'),
  (10, 15, 'approach', -2.25, 'amateur_avg'),
  (10, 15, 'short_game', -1.32, 'amateur_avg'),
  (10, 15, 'putting', -4.00, 'amateur_avg'),
  (15, 20, 'off_tee', -0.38, 'amateur_avg'),
  (15, 20, 'approach', -2.97, 'amateur_avg'),
  (15, 20, 'short_game', -1.68, 'amateur_avg'),
  (15, 20, 'putting', -6.00, 'amateur_avg'),
  (20, 25, 'off_tee', -0.38, 'amateur_avg'),
  (20, 25, 'approach', -3.33, 'amateur_avg'),
  (20, 25, 'short_game', -2.21, 'amateur_avg'),
  (20, 25, 'putting', -7.00, 'amateur_avg'),
  (25, 36, 'off_tee', -0.46, 'amateur_avg'),
  (25, 36, 'approach', -3.60, 'amateur_avg'),
  (25, 36, 'short_game', -2.68, 'amateur_avg'),
  (25, 36, 'putting', -9.00, 'amateur_avg')
on conflict (handicap_high, category) do nothing;

-- One row per (round, category): the golfer's own proxy SG for that round,
-- the bracket benchmark it was compared against (their handicap at the time,
-- looked up by bracket), and the delta. Recomputed by deleting + reinserting
-- on every round save rather than updated in place -- simpler than
-- reconciling partial edits, and cheap since it's at most 4 rows.
create table if not exists public.round_analysis (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('off_tee', 'approach', 'short_game', 'putting')),
  user_sg numeric(5, 2) not null,
  benchmark_sg numeric(5, 2) not null,
  delta_sg numeric(5, 2) not null,   -- positive = better than typical for this golfer's handicap
  created_at timestamptz not null default now(),
  unique (round_id, category)
);

create index if not exists round_analysis_user_id_idx on public.round_analysis (user_id, created_at desc);
create index if not exists round_analysis_round_id_idx on public.round_analysis (round_id);

alter table public.round_analysis enable row level security;
create policy "select own round_analysis" on public.round_analysis for select using (auth.uid() = user_id);
create policy "insert own round_analysis" on public.round_analysis for insert with check (auth.uid() = user_id);
create policy "delete own round_analysis" on public.round_analysis for delete using (auth.uid() = user_id);
