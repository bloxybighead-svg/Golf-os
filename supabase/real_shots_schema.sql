-- ============================================================
-- Golf OS — Real Shots (actual launch-monitor shots, distinct from
-- simulated_shots). Seeded once from
-- shot-pattern-simulator/reference_data/real_shots.csv.
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists real_shots (
  id             bigint generated always as identity primary key,
  golfer_name    text not null,
  session_label  text not null,
  shot_date      date,
  club           text not null,
  carry_yds      numeric(6,1) not null,
  offline_yds    numeric(6,2) not null,
  curve_yds      numeric(6,2),
  launch_dir_deg numeric(5,2),
  ball_speed_mph numeric(6,2),
  is_partial     boolean not null default false,
  created_at     timestamptz default now()
);

create index if not exists idx_real_shots_golfer_club on real_shots (golfer_name, club);

-- Single-user app, no auth yet — same as every other table in this schema.
alter table real_shots disable row level security;
