-- ============================================================
-- Golf OS — Supabase Schema
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Drill library (reference table)
create table if not exists drills (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  category    text not null check (category in ('Full Swing','Wedge','Chipping','Bunker','Putting')),
  description text,
  target_metric text,
  created_at  timestamptz default now()
);

-- Practice sessions (header)
create table if not exists practice_sessions (
  id               uuid default gen_random_uuid() primary key,
  date             date not null,
  start_time       time,
  duration_minutes integer,
  location         text[] not null default '{}',
  session_type     text not null,
  primary_goal     text,
  overall_feel     integer check (overall_feel between 1 and 5),
  energy_level     integer check (energy_level between 1 and 5),
  notes            text,
  created_at       timestamptz default now()
);

-- Session blocks (segments inside a session)
create table if not exists session_blocks (
  id               uuid default gen_random_uuid() primary key,
  session_id       uuid references practice_sessions(id) on delete cascade not null,
  block_order      integer not null default 0,
  block_type       text not null,
  duration_minutes integer,
  drill_id         uuid references drills(id) on delete set null,
  drill_free_text  text,
  clubs_used       text[] default '{}',
  shot_count       integer,
  distance_range   text,
  launch_pro       boolean default false,
  quality_rating   integer check (quality_rating between 1 and 5),
  notes            text,
  created_at       timestamptz default now()
);

-- ============================================================
-- RLS: disabled for now (personal tracker, no auth yet)
-- Re-enable and add policies when you add user accounts
-- ============================================================
alter table drills             disable row level security;
alter table practice_sessions  disable row level security;
alter table session_blocks     disable row level security;

-- ============================================================
-- Seed: starter drill library
-- ============================================================
insert into drills (name, category, description, target_metric) values
  ('Pelz Lag Ladder',          'Putting',    'Hit putts at increasing distances to dial in lag. 10ft → 20ft → 30ft → 40ft.',                                  'All balls within 3 feet'),
  ('Stockton Clock Drill',     'Putting',    '12 putts around the hole at 3 feet, one at each clock position.',                                                 'Hole all 12 in a row'),
  ('Gate Drill',               'Putting',    'Two tees just wider than putter face as a gate. Roll through clean.',                                             '10 clean strokes, no gate hit'),
  ('100-Ball Putting',         'Putting',    'Hit 100 putts from 6 feet. Track makes. Build pressure.',                                                         '80+ out of 100'),
  ('Launch Pro Ladder 30-100', 'Wedge',      'Hit shots at 10-yard increments: 30, 40, 50, 60, 70, 80, 90, 100. One per target.',                              'Within 5 yards of each target'),
  ('3-Yardage Grind',          'Wedge',      'Pick 3 wedge yardages. Hit 10 balls to each. Full commitment, same shot each time.',                              'Tight dispersion, confidence'),
  ('Pressure Wedge',           'Wedge',      'Must land within 10 feet 3 consecutive times before moving to next yardage.',                                     '3 in a row to each target'),
  ('9-Shot Shape Grid',        'Full Swing', 'Hit all 9 ball flights: draw/straight/fade × low/mid/high. 3 balls each.',                                        'Execute all 9 shapes cleanly'),
  ('Step-Drill Tempo',         'Full Swing', 'Step forward into the ball to feel weight transfer and proper tempo. Slow and deliberate.',                       '15 reps with flush contact'),
  ('On/Off Drill',             'Full Swing', 'Alternate: one ball in practice mode (rehearse/reset), one ball in play mode (step in, shot clock, commit).',    'Feel the mental switch'),
  ('3-Ball Chip and Chase',    'Chipping',   'Chip 3 balls from different lies around the green to same hole. Walk, assess, chip.',                             'All 3 within 6 feet'),
  ('Bump and Run Matrix',      'Chipping',   'Hit bump-and-run from 4 spots around the green with 3 different clubs. Compare roll-out.',                        'Understanding of club selection'),
  ('Pressure Bunker',          'Bunker',     'Must get up and down from same bunker lie 3 consecutive times before you leave.',                                 'Up and down 3 in a row'),
  ('Splash Drill',             'Bunker',     'Draw a line 2 inches behind the ball. Practice entering sand on the line every time.',                            'Consistent entry point 10/10')
on conflict do nothing;
