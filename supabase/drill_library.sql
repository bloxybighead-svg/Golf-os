-- Applied to project clgjzoedmtguchilmkdj (migration: drill_library).
--
-- A curated, SHARED catalog of drills tagged by strokes-gained category, used
-- to recommend drills for the golfer's weakest category on the dashboard.
-- Deliberately separate from the existing per-user `drills` table (Practice ->
-- Drills), which is each golfer's own custom list with different categories
-- (Full Swing/Wedge/Chipping/Bunker/Putting/Mental) and no instructions,
-- reps, or time estimates. Likewise `user_drills` logs runs of these
-- recommended drills (start -> complete); full practice sessions are still
-- logged in the Practice Log (practice_sessions/session_blocks).
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
