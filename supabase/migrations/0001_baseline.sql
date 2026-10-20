-- 0001_baseline: the whole schema as the loose files in supabase/legacy/ leave it, in dependency
-- order, for a fresh database. An existing project does NOT run this: mark it applied with
-- `supabase migration repair --status applied 0001` (see README, Database).
--
-- Conflicts between the old files, and which one won (the later behaviour):
--  * course_corrections: course_corrections.sql (public read, any signed-in user may update, unique on
--    course/hole/field) -> course_corrections_privacy.sql (column-level select) -> course_corrections_v2.sql
--    (owner-only policies, per-user unique key, value-length checks, consensus function). v2 wins.
--    The submitted_by column the privacy file drops is never created here.
--  * api_rate_limits.sql deleted old rows inside hit_rate_limit(); api_rate_limits_v2.sql removes that
--    and clears rows with pg_cron instead. v2 wins.
--  * simulator_rls_migration.sql made golfer_profiles / simulated_shots / real_shots public-read;
--    shot_data_13c_lockdown.sql narrows the first two to non-calibrated golfers and removes the public
--    read on real_shots. Lockdown wins. real_shots.golfer_name is nullable (shot_data_13c.sql).
--  * per_user_data.sql adds user_id to the older tables and backfills it to one account; on a fresh
--    database the columns are created NOT NULL and there is nothing to backfill.
--  * schema.sql / rounds_schema.sql / simulated_shots_schema.sql carry "disable row level security"
--    history; every table here has RLS on.
-- Left out on purpose (data fixes or read-only checks, not schema): scale_partial_differentials.sql,
-- review_round_dates.sql, shot_data_13c_migrate_dillon.sql, simulated_shots_queries.sql, tests/.
--
-- Checked against the live table and column list (2026-10-20). Four things the files did not say, taken from it:
-- the rounds columns holes_played .. miss_right_pct (no file creates them) and the rounds columns fairways_hit /
-- fairways_total / gir (gone live, so not here); drills.category also allows 'Mental'; session_blocks has
-- drill_free_text; wedge_reference exists. The handicap_tracking columns esr_adjustment / cap_applied are not
-- live yet and are in 0004_handicap_caps.sql. Indexes, policies, functions and views were not read from the live
-- database, so they are the files' versions.

create extension if not exists pg_cron;

-- Personal tables -------------------------------------------------------------------------------
create table if not exists public.rounds (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  date           date not null,
  course_name    text not null,
  holes_played   integer not null default 18,
  score          integer not null,
  par            integer not null default 72,
  is_competitive boolean not null default false,
  breakdown_tags text[] not null default '{}',
  course_rating  numeric(4, 1),
  slope_rating   integer,
  differential   numeric(4, 1),
  penalties      integer,
  fairways_pct   numeric,
  gir_pct        numeric,
  total_putts    integer,
  three_putts    integer,
  up_and_downs   integer,
  miss_left_pct  numeric,
  miss_right_pct numeric,
  notes          text,
  handicap_index numeric(4, 1),   -- the golfer's tracked index when the round was saved
  is_9_hole      boolean generated always as (holes_played = 9) stored,
  adjusted_score integer,         -- WHS adjusted gross; null = score-only round
  score_cap      text check (score_cap is null or score_cap in ('net_double_bogey', 'par_plus_5', 'approximate', 'none')),
  differential_status text check (differential_status is null or differential_status in ('rated', 'waiting_for_index', 'no_rating', 'too_short')),
  course_id      text,            -- OpenGolfAPI course id, when picked from search
  tee_name       text,
  created_at     timestamptz default now()
);
create index if not exists rounds_user_id_idx on public.rounds(user_id);
alter table public.rounds enable row level security;
create policy "select own rounds" on public.rounds for select using (auth.uid() = user_id);
create policy "insert own rounds" on public.rounds for insert with check (auth.uid() = user_id);
create policy "update own rounds" on public.rounds for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own rounds" on public.rounds for delete using (auth.uid() = user_id);

create table if not exists public.drills (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  category    text not null check (category in ('Full Swing','Wedge','Chipping','Bunker','Putting','Mental')),
  description text,
  target_metric text,
  created_at  timestamptz default now()
);
create index if not exists drills_user_id_idx on public.drills(user_id);
alter table public.drills enable row level security;
create policy "select own drills" on public.drills for select using (auth.uid() = user_id);
create policy "insert own drills" on public.drills for insert with check (auth.uid() = user_id);
create policy "update own drills" on public.drills for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own drills" on public.drills for delete using (auth.uid() = user_id);

create table if not exists public.practice_sessions (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  date             date not null,
  start_time       time,
  duration_minutes integer,
  location         text[] not null default '{}',
  session_type     text not null,
  primary_goal     text,
  overall_feel     integer check (overall_feel between 1 and 5),
  energy_level     integer check (energy_level between 1 and 5),
  notes            text,
  club_work        jsonb not null default '[]',
  created_at       timestamptz default now()
);
create index if not exists practice_sessions_user_id_idx on public.practice_sessions(user_id);
alter table public.practice_sessions enable row level security;
create policy "select own practice_sessions" on public.practice_sessions for select using (auth.uid() = user_id);
create policy "insert own practice_sessions" on public.practice_sessions for insert with check (auth.uid() = user_id);
create policy "update own practice_sessions" on public.practice_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own practice_sessions" on public.practice_sessions for delete using (auth.uid() = user_id);

create table if not exists public.session_blocks (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  session_id       uuid references public.practice_sessions(id) on delete cascade not null,
  drill_id         uuid references public.drills(id),
  drill_free_text  text,
  block_order      integer not null default 0,
  block_type       text not null,
  duration_minutes integer,
  activities       jsonb not null default '[]'::jsonb,
  clubs_used       text[] default '{}',
  shot_count       integer,
  distance_range   text,
  launch_pro       boolean default false,
  quality_rating   integer check (quality_rating between 1 and 5),
  notes            text,
  created_at       timestamptz default now()
);
create index if not exists session_blocks_user_id_idx on public.session_blocks(user_id);
alter table public.session_blocks enable row level security;
create policy "select own session_blocks" on public.session_blocks for select using (auth.uid() = user_id);
create policy "insert own session_blocks" on public.session_blocks for insert with check (auth.uid() = user_id);
create policy "update own session_blocks" on public.session_blocks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own session_blocks" on public.session_blocks for delete using (auth.uid() = user_id);

create table if not exists public.milestones (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  label      text not null,
  created_at timestamptz default now()
);
create index if not exists milestones_user_id_idx on public.milestones(user_id);
alter table public.milestones enable row level security;
create policy "select own milestones" on public.milestones for select using (auth.uid() = user_id);
create policy "insert own milestones" on public.milestones for insert with check (auth.uid() = user_id);
create policy "update own milestones" on public.milestones for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own milestones" on public.milestones for delete using (auth.uid() = user_id);

-- Handicap --------------------------------------------------------------------------------------
create table if not exists public.handicap_tracking (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  handicap_index numeric(4, 1) not null,
  source text not null check (source in ('manual', 'calculated')),
  calculation_date timestamptz not null default now(),
  rounds_used integer,            -- how many differentials fed a 'calculated' row; null for 'manual'
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, calculation_date)
);
create index if not exists handicap_tracking_user_id_idx on public.handicap_tracking (user_id, calculation_date desc);
alter table public.handicap_tracking enable row level security;
create policy "select own handicap_tracking" on public.handicap_tracking for select using (auth.uid() = user_id);
create policy "insert own handicap_tracking" on public.handicap_tracking for insert with check (auth.uid() = user_id);
create policy "delete own handicap_tracking" on public.handicap_tracking for delete using (auth.uid() = user_id);

create table if not exists public.golfer_baseline (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handicap_index numeric(4, 1),
  carries jsonb not null default '{}'::jsonb,  -- {"Driver": 250, "7-Iron": 155, ...} in yards
  home_course jsonb,                           -- {id, name, city, state, par, lat, lng} from course search
  bag jsonb,        -- {"calibrated": ["Driver", ...], "handicap": ["Driver", ...]}
  tendency jsonb,   -- {"side": "auto", "strength": "moderate"}
  source text check (source is null or source in ('calibrated', 'handicap')),   -- whose shots the planner uses
  updated_at timestamptz not null default now()
);
alter table public.golfer_baseline enable row level security;
create policy "select own golfer_baseline" on public.golfer_baseline for select using (auth.uid() = user_id);
create policy "insert own golfer_baseline" on public.golfer_baseline for insert with check (auth.uid() = user_id);
create policy "update own golfer_baseline" on public.golfer_baseline for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own golfer_baseline" on public.golfer_baseline for delete using (auth.uid() = user_id);

-- Hole by hole ----------------------------------------------------------------------------------
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
  penalty_shot text check (penalty_shot in ('tee', 'approach', 'other')),
  stroke_index smallint check (stroke_index is null or stroke_index between 1 and 18),   -- 1 = hardest
  created_at timestamptz not null default now(),
  unique (round_id, hole_number)
);
create index if not exists round_holes_user_id_idx on public.round_holes (user_id);
alter table public.round_holes enable row level security;
create policy "select own round_holes" on public.round_holes for select using (auth.uid() = user_id);
create policy "insert own round_holes" on public.round_holes for insert with check (
  auth.uid() = user_id and exists (select 1 from public.rounds r where r.id = round_id and r.user_id = auth.uid())
);
create policy "update own round_holes" on public.round_holes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own round_holes" on public.round_holes for delete using (auth.uid() = user_id);

create table if not exists public.wedge_reference (
  id smallint primary key default 1,
  updated_at timestamptz default now(),
  entries jsonb not null default '[]'::jsonb
);
alter table public.wedge_reference enable row level security;
create policy "public read wedge_reference" on public.wedge_reference for select using (true);

-- Strokes-gained proxy and drill library --------------------------------------------------------
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

create table if not exists public.drill_library (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('off_tee', 'approach', 'short_game', 'putting')),
  description text,
  target_area text,
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  reps_suggested integer,
  time_estimate_mins integer,
  instructions text,
  equipment_needed text,
  created_at timestamptz not null default now()
);

create index if not exists drill_library_category_idx on public.drill_library (category);

-- Reference data: world-readable, seeded/maintained only through migrations.
alter table public.drill_library enable row level security;
create policy "public read drill_library" on public.drill_library for select to anon, authenticated using (true);

insert into public.drill_library (name, category, description, target_area, difficulty, reps_suggested, time_estimate_mins, instructions, equipment_needed) values
  -- off_tee
  ('Fairway Corridor', 'off_tee', 'Hit drivers into a range "fairway" and count how many stay in it.', 'fairways', 'intermediate', 20, 20,
   'Pick two range targets about 30 yards apart to act as the edges of a fairway. Hit 20 drivers with your full pre-shot routine, one ball at a time. Count how many finish between the two targets. Goal: 12/20 or better.', 'driver, balls, range'),
  ('Tee Shot Consistency', 'off_tee', 'Same target, same routine, every ball.', 'fairways', 'beginner', 20, 20,
   'Choose one target and hit 20 tee shots at it, resetting your full routine each time. Note where each ball finishes (left, center, right). Goal: a predictable miss -- most misses on one side, not both.', 'driver, balls, tee'),
  ('Start-Line Gate', 'off_tee', 'Train the ball to start on your intended line.', 'start line', 'intermediate', 15, 15,
   'Push two alignment sticks (or tees) into the ground about 10 feet in front of you, a club-head width either side of your target line. Hit 15 drivers; count the balls that start through the gate. Goal: 10/15.', 'driver, balls, 2 alignment sticks'),
  ('Club-Down Tee Shots', 'off_tee', 'Practice the safer tee shot for tight holes.', 'tight fairways', 'intermediate', 15, 15,
   'Using a 3-wood or hybrid, hit 15 tee shots into a fairway corridor about 25 yards wide. Goal: 11/15 in the corridor -- this is the shot to reach for when driver brings trouble into play.', '3-wood or hybrid, balls, range'),
  ('Pressure Driver Ten', 'off_tee', 'Simulate on-course pressure with a score to beat.', 'fairways under pressure', 'advanced', 10, 15,
   'Hit 10 drivers into a 30-yard corridor. Score +1 for each ball in, -1 for each ball out. You only get one ball per "hole" and must do your full routine. Goal: finish at +4 or better, then try to beat your best score next time.', 'driver, balls, range'),
  -- approach
  ('100 Approach Shots', 'approach', 'High-volume approach work to green-sized targets.', 'greens', 'intermediate', 100, 45,
   'Hit 100 shots from 75-150 yards at flags, changing target every 10 balls. Count a ball as a "green" if it would finish within about 15 yards of the flag. Track your hit rate. Goal: beat your current GIR%.', 'balls, range, flags'),
  ('Wedge Distance Ladder', 'approach', 'Dial in carry distances inside 100 yards.', 'wedge distances', 'intermediate', 30, 25,
   'Hit 5 balls each to 50, 60, 70, 80, 90 and 100 yards (use a rangefinder or launch monitor). Count a shot as good if it carries within 5 yards of the target number. Goal: 20/30.', 'wedges, balls, rangefinder or launch monitor'),
  ('Stock Iron Dispersion', 'approach', 'Measure how tight your go-to iron really is.', 'iron dispersion', 'intermediate', 20, 20,
   'With one mid-iron, hit 20 balls at a single target. Note where each lands relative to the target. Goal: 14/20 finish within 10 yards of the target. This is the same dispersion the course planner uses to pick your aim.', 'mid-iron, balls, range'),
  ('Par-3 Tee Shots', 'approach', 'Short-iron shots to a green-sized target.', 'par 3s', 'beginner', 15, 15,
   'Pick a green-sized target 140-180 yards away. Hit 15 balls from a tee with full routine. Count the ones that would hold the green. Goal: 7/15.', 'irons, balls, tee, range'),
  ('Random Approach Round', 'approach', 'Game-like practice: new club and target every ball.', 'on-course transfer', 'advanced', 18, 30,
   'Play an imaginary 18 approach shots: every ball gets a new target and yardage, a new club, and your full routine. Never hit the same shot twice in a row. Count "greens hit". Goal: beat your real on-course GIR count.', 'full bag, balls, range'),
  -- short_game
  ('Greenside Chips', 'short_game', 'Get chips close from just off the green.', 'chips', 'intermediate', 30, 20,
   'Chip 30 balls from 10-20 feet off the green to a hole, varying the lie every few balls. Goal: 21/30 (70%) finish inside 6 feet.', 'balls, wedge, chipping green'),
  ('Up-and-Down Challenge', 'short_game', 'Chip and putt out -- it only counts if you save par.', 'scrambling', 'intermediate', 9, 20,
   'Drop 9 balls at different spots around a green (fringe, rough, uphill, downhill). Play each one: chip, then putt out. Count the up-and-downs (holed in 2 or fewer). Goal: 5/9.', 'balls, wedge, putter, practice green'),
  ('Bunker Escapes', 'short_game', 'Get out and on the green every time.', 'bunkers', 'advanced', 20, 20,
   'Hit 20 greenside bunker shots, changing the lie every 5 balls (flat, uphill, downhill, buried). Goal: 18/20 (90%) on the green, then work on getting them inside 10 feet.', 'balls, sand wedge, practice bunker'),
  ('Landing Spot Towel', 'short_game', 'Pick a landing spot and hit it.', 'chip landing spot', 'beginner', 20, 15,
   'Lay a towel on the green about 3 feet on, between you and the hole. Chip 20 balls trying to land each one on the towel. Goal: 12/20 land on it -- the roll-out takes care of itself once the landing spot is right.', 'balls, wedge, towel, chipping green'),
  ('Pitch Distance Ladder', 'short_game', 'Control distance on 20-40 yard pitches.', 'pitches', 'intermediate', 30, 20,
   'Hit 10 pitches each to targets at 20, 30 and 40 yards. Count a shot as good if it finishes within 10 feet of the target. Goal: 18/30.', 'balls, wedges, short-game area'),
  -- putting
  ('Lag Putting', 'putting', 'Long putts that finish tap-in close.', 'lag', 'intermediate', 50, 25,
   'Hit 50 putts from 30-40 feet to different holes. Count a putt as good if it finishes inside 3 feet. Goal: 35/50 -- that is what keeps 3-putts off the card.', 'balls, putter, putting green'),
  ('3-Foot Putts', 'putting', 'Make the short ones automatic.', 'short putts', 'beginner', 20, 10,
   'Make 20 consecutive 3-foot putts. Miss one, start the count again. A confidence builder to finish a session on.', 'balls, putter, putting green'),
  ('Clock Drill', 'putting', 'Short putts from every side of the hole.', 'short putts', 'intermediate', 24, 15,
   'Place 8 balls in a circle 3 feet from the hole, like the numbers on a clock. Make all 8, then move out to 4 feet, then 5 feet. A miss restarts the current circle. Goal: finish all three circles.', 'balls, putter, putting green, tees to mark'),
  ('Lag Ladder', 'putting', 'Distance control across different lengths.', 'distance control', 'intermediate', 9, 15,
   'Putt 3 balls each from 20, 30 and 40 feet. Each must stop inside a 3-foot circle around the hole (mark it with tees). Goal: 7/9, and none left more than 3 feet short.', 'balls, putter, putting green, tees')
on conflict (name) do nothing;

create table if not exists public.user_drills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  drill_id uuid not null references public.drill_library(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,          -- null = started but not finished
  reps_completed integer check (reps_completed is null or reps_completed >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists user_drills_user_idx on public.user_drills (user_id, started_at desc);

alter table public.user_drills enable row level security;
create policy "select own user_drills" on public.user_drills for select using (auth.uid() = user_id);
create policy "insert own user_drills" on public.user_drills for insert with check (auth.uid() = user_id);
create policy "update own user_drills" on public.user_drills for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own user_drills" on public.user_drills for delete using (auth.uid() = user_id);

-- Course data -----------------------------------------------------------------------------------
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
create policy "select own course_zones" on public.course_zones for select to authenticated using (auth.uid() = user_id);
create policy "insert own course_zones" on public.course_zones for insert to authenticated with check (auth.uid() = user_id);
create policy "update own course_zones" on public.course_zones for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own course_zones" on public.course_zones for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.hole_ob_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,       -- OpenGolfAPI course id, as in course_zones
  hole_id text not null,         -- the hole's OSM way id (CourseHole.id), as in course_corrections
  side text not null check (side in ('left', 'right', 'long', 'none')),
  margin_yds numeric not null default 15 check (margin_yds between 0 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_id, hole_id, side)
);
create index if not exists hole_ob_tags_user_course_idx on public.hole_ob_tags (user_id, course_id);
alter table public.hole_ob_tags enable row level security;
create policy "select own hole_ob_tags" on public.hole_ob_tags for select to authenticated using (auth.uid() = user_id);
create policy "insert own hole_ob_tags" on public.hole_ob_tags for insert to authenticated with check (auth.uid() = user_id);
create policy "update own hole_ob_tags" on public.hole_ob_tags for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own hole_ob_tags" on public.hole_ob_tags for delete to authenticated using (auth.uid() = user_id);

-- Shared cache of OpenStreetMap course geometry: public read, written only with the service-role key.
create table if not exists public.course_geometry (
  course_key text primary key,          -- e.g. "ogapi:<OpenGolfAPI course id>"
  name text,
  lat double precision,
  lng double precision,
  geometry jsonb not null,              -- CourseGeometry (holes, features, coast, scope)
  fetched_at timestamptz not null default now()
);
alter table public.course_geometry enable row level security;
create policy "public read course_geometry" on public.course_geometry for select to anon, authenticated using (true);

create table if not exists public.course_elevation (
  course_key text not null,             -- e.g. "ogapi:<OpenGolfAPI course id>"
  hole_id text not null,                -- the hole's OSM way id, e.g. "way/917183416"
  points jsonb not null,                -- [{lat, lng}] the heights were looked up for
  elevations_ft jsonb not null,         -- [number|null], same order as points
  source text not null,                 -- 'usgs' or 'open-meteo'
  fetched_at timestamptz not null default now(),
  primary key (course_key, hole_id)
);
alter table public.course_elevation enable row level security;
create policy "public read course_elevation" on public.course_elevation for select to anon, authenticated using (true);

-- Golfer-submitted fixes to course data. Per-user rows, owner-only; a value applies to everyone only
-- when 2+ distinct golfers submitted it (course_corrections_consensus).
create table if not exists public.course_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_key text not null,             -- same key as course_geometry.course_key ("ogapi:<id>")
  hole_id text not null,                -- CourseHole.id
  field_name text not null check (field_name in ('par', 'tee_lat', 'tee_lng', 'yardage', 'handicap')),
  original_value text check (original_value is null or char_length(original_value) <= 32),
  corrected_value text not null check (char_length(corrected_value) between 1 and 32),
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_corrections_user_key unique (course_key, hole_id, field_name, user_id)
);
create index if not exists course_corrections_course_idx on public.course_corrections (course_key);
alter table public.course_corrections enable row level security;
create policy "owner select course_corrections" on public.course_corrections for select to authenticated using (auth.uid() = user_id);
create policy "owner insert course_corrections" on public.course_corrections for insert to authenticated with check (auth.uid() = user_id);
create policy "owner update course_corrections" on public.course_corrections for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner delete course_corrections" on public.course_corrections for delete to authenticated using (auth.uid() = user_id);
revoke select on public.course_corrections from anon, authenticated;
grant select on public.course_corrections to authenticated;

create or replace function public.course_corrections_consensus(p_course_key text, p_min_users int default 2)
returns table (hole_id text, field_name text, corrected_value text, voters int, last_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.hole_id, c.field_name, c.corrected_value,
         count(distinct c.user_id)::int as voters,
         max(c.updated_at) as last_at
  from public.course_corrections c
  where c.course_key = p_course_key
  group by c.hole_id, c.field_name, c.corrected_value
  having count(distinct c.user_id) >= greatest(coalesce(p_min_users, 2), 2)
$$;
revoke all on function public.course_corrections_consensus(text, int) from public;
grant execute on function public.course_corrections_consensus(text, int) to anon, authenticated;

-- API rate limits: server-only (RLS on, no policies; function executable by service_role only) ----
create table if not exists public.api_rate_limits (
  bucket text primary key,          -- e.g. "search:ip:203.0.113.7", "geometry-miss:user:<uuid>"
  window_start timestamptz not null,
  hits integer not null
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;

create or replace function public.hit_rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  insert into public.api_rate_limits as r (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;

  return v_hits <= p_max;
end;
$$;
revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

select cron.unschedule('api-rate-limits-cleanup')
where exists (select 1 from cron.job where jobname = 'api-rate-limits-cleanup');
select cron.schedule(
  'api-rate-limits-cleanup',
  '*/15 * * * *',
  $$delete from public.api_rate_limits where window_start < now() - interval '1 hour'$$
);

-- Shot simulator and shot data ------------------------------------------------------------------
create table if not exists public.golfer_profiles (
  id                  uuid primary key default gen_random_uuid(),
  golfer_name         text not null,
  source              text not null check (source in ('calibrated','handicap','band','tier')),
  source_label        text not null,   -- e.g. 'calibrated', 'handicap_8.5', 'band_2-4', 'tour'
  club                text not null,
  mean_carry_yds      numeric(6,1) not null,
  distance_cv         numeric(6,4),
  direction_sd_deg    numeric(5,2),
  start_line_bias_deg numeric(5,2),
  start_line_sd_deg   numeric(5,2),
  curve_bias_pct      numeric(6,4),
  curve_sd_pct        numeric(6,4),
  curve_carry_slope   numeric(6,3),
  n_shots             integer,          -- real shots the profile was fit from; null when source != 'calibrated'
  created_at          timestamptz default now(),
  unique (golfer_name, source_label, club)
);

create table if not exists public.simulated_shots (
  id                bigint generated always as identity primary key,
  golfer_profile_id uuid not null references public.golfer_profiles(id) on delete cascade,
  batch_id          uuid not null,      -- groups rows from one CSV import / generation run
  session_id        integer not null,
  shot_id           integer not null,
  club              text not null,
  carry_yds         numeric(6,1) not null,
  offline_yds       numeric(6,2) not null,
  start_line_deg    numeric(5,2) not null,
  curve_yds         numeric(6,2) not null,
  direction_deg     numeric(5,2) not null,
  is_mishit         boolean not null default false,
  created_at        timestamptz default now()
);
create index if not exists idx_simulated_shots_club       on public.simulated_shots (club);
create index if not exists idx_simulated_shots_profile    on public.simulated_shots (golfer_profile_id);
create index if not exists idx_simulated_shots_batch      on public.simulated_shots (batch_id);
create index if not exists idx_simulated_shots_club_carry on public.simulated_shots (club, carry_yds);

create table if not exists public.shot_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,
  session_date date,
  environment text not null default 'outdoor' check (environment in ('indoor', 'outdoor')),
  surface text not null default 'grass' check (surface in ('mat', 'grass')),
  excluded boolean not null default false,
  temperature_f numeric check (temperature_f is null or temperature_f between -20 and 120),
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

create table if not exists public.real_shots (
  id             bigint generated always as identity primary key,
  golfer_name    text,                -- legacy rows keep theirs
  session_label  text not null,
  shot_date      date,
  club           text not null,
  carry_yds      numeric(6,1) not null,
  offline_yds    numeric(6,2) not null,
  curve_yds      numeric(6,2),
  launch_dir_deg numeric(5,2),
  ball_speed_mph numeric(6,2),
  is_partial     boolean not null default false,
  user_id        uuid references auth.users(id) on delete cascade,
  session_id     uuid references public.shot_sessions(id) on delete cascade,
  created_at     timestamptz default now()
);
create index if not exists idx_real_shots_golfer_club on public.real_shots (golfer_name, club);
create index if not exists real_shots_user_session_idx on public.real_shots(user_id, session_id);

alter table public.golfer_profiles enable row level security;
alter table public.simulated_shots enable row level security;
alter table public.real_shots enable row level security;
alter table public.shot_sessions enable row level security;
alter table public.shot_profiles enable row level security;

-- Only the synthetic golfers are public; calibrated (real golfer) profiles and their shots are not.
create policy "public read golfer_profiles" on public.golfer_profiles
  for select to anon, authenticated using (source <> 'calibrated');
create policy "public read simulated_shots" on public.simulated_shots
  for select to anon, authenticated using (
    exists (select 1 from public.golfer_profiles p where p.id = golfer_profile_id and p.source <> 'calibrated')
  );
create policy "select own shot_sessions" on public.shot_sessions for select using (auth.uid() = user_id);
create policy "insert own shot_sessions" on public.shot_sessions for insert with check (auth.uid() = user_id);
create policy "update own shot_sessions" on public.shot_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own shot_sessions" on public.shot_sessions for delete using (auth.uid() = user_id);
create policy "select own shot_profiles" on public.shot_profiles for select using (auth.uid() = user_id);
create policy "insert own shot_profiles" on public.shot_profiles for insert with check (auth.uid() = user_id);
create policy "update own shot_profiles" on public.shot_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own shot_profiles" on public.shot_profiles for delete using (auth.uid() = user_id);

-- A shot may only join a session its owner owns.
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

-- Views run with the caller's permissions so RLS applies.
create or replace view club_dispersion as
select
  p.golfer_name,
  p.source_label,
  s.club,
  count(*)                                                                        as n_shots,
  round(avg(s.carry_yds)::numeric, 1)                                             as carry_mean,
  round(stddev_samp(s.carry_yds)::numeric, 1)                                     as carry_sd,
  round((percentile_cont(0.10) within group (order by s.carry_yds))::numeric, 1)   as carry_p10,
  round((percentile_cont(0.50) within group (order by s.carry_yds))::numeric, 1)   as carry_p50,
  round((percentile_cont(0.90) within group (order by s.carry_yds))::numeric, 1)   as carry_p90,
  round(stddev_samp(s.offline_yds)::numeric, 1)                                   as offline_sd,
  round((percentile_cont(0.10) within group (order by s.offline_yds))::numeric, 1) as offline_p10,
  round((percentile_cont(0.50) within group (order by s.offline_yds))::numeric, 1) as offline_p50,
  round((percentile_cont(0.90) within group (order by s.offline_yds))::numeric, 1) as offline_p90,
  round((100.0 * sum((s.is_mishit)::int) / count(*))::numeric, 1)                  as mishit_pct
from public.simulated_shots s
join public.golfer_profiles p on p.id = s.golfer_profile_id
group by p.golfer_name, p.source_label, s.club;

-- Club-pairing overlap: for every pair of clubs (same golfer + profile),
-- how much their 10th-90th percentile carry ranges overlap. A high
-- overlap % means the two clubs aren't meaningfully different in
-- practice — a real "which one do I hit" problem, not just a small gap
-- in average distance.
create or replace view club_gapping_overlap as
select
  a.golfer_name,
  a.source_label,
  a.club as shorter_club,
  b.club as longer_club,
  a.carry_mean as shorter_mean,
  b.carry_mean as longer_mean,
  round(b.carry_mean - a.carry_mean, 1) as mean_gap_yds,
  greatest(a.carry_p10, b.carry_p10)                                                                as overlap_start_yds,
  least(a.carry_p90, b.carry_p90)                                                                    as overlap_end_yds,
  greatest(least(a.carry_p90, b.carry_p90) - greatest(a.carry_p10, b.carry_p10), 0)                   as overlap_yds,
  round(
    100.0 * greatest(least(a.carry_p90, b.carry_p90) - greatest(a.carry_p10, b.carry_p10), 0)
    / least(a.carry_p90 - a.carry_p10, b.carry_p90 - b.carry_p10),
    1
  ) as overlap_pct_of_narrower_range
from club_dispersion a
join club_dispersion b
  on a.golfer_name   = b.golfer_name
 and a.source_label  = b.source_label
 and a.carry_mean    < b.carry_mean
order by a.golfer_name, a.source_label, overlap_pct_of_narrower_range desc nulls last;

alter view public.club_dispersion set (security_invoker = true);
alter view public.club_gapping_overlap set (security_invoker = true);
