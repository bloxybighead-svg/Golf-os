-- ============================================================
-- Golf OS — Simulated Shots (shot pattern simulator extension)
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- One row per (golfer, profile source, club): the calibration parameters
-- SyntheticGolfer used to generate shots for that club. Shape mirrors the
-- JSON calibrate.py fits — see shot-pattern-simulator/reference_data/*.json.
--
-- No `users` table exists yet (single-user app, no auth — same as
-- rounds/milestones), so golfer_name is a free-text label rather than a
-- foreign key. When Supabase Auth is added, swap it for a user_id uuid
-- references auth.users(id) and re-enable RLS with an owner policy, same
-- as the commented pattern in rounds_schema.sql.
create table if not exists golfer_profiles (
  id                  uuid primary key default gen_random_uuid(),
  golfer_name         text not null,
  source              text not null check (source in ('calibrated','handicap','band','tier')),
  source_label        text not null,   -- e.g. 'calibrated', 'handicap_8.5', 'band_2-4', 'tour' — mirrors the CSV's skill_level column
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

-- One row per simulated shot. `club` is denormalized from golfer_profiles
-- onto every row on purpose: nearly every query filters or groups by club,
-- and duplicating one text value is cheaper than joining golfer_profiles
-- every time you want it.
create table if not exists simulated_shots (
  id                bigint generated always as identity primary key,
  golfer_profile_id  uuid not null references golfer_profiles(id) on delete cascade,
  batch_id          uuid not null,      -- groups rows from one CSV import / generation run
  session_id        integer not null,  -- raw session index from the generator (resets each run — not globally unique, kept for traceability)
  shot_id           integer not null,  -- raw per-run shot index (not globally unique, kept for traceability)
  club              text not null,
  carry_yds         numeric(6,1) not null,
  offline_yds       numeric(6,2) not null,
  start_line_deg    numeric(5,2) not null,
  curve_yds         numeric(6,2) not null,
  direction_deg     numeric(5,2) not null,
  is_mishit         boolean not null default false,
  created_at        timestamptz default now()
);

create index if not exists idx_simulated_shots_club       on simulated_shots (club);
create index if not exists idx_simulated_shots_profile    on simulated_shots (golfer_profile_id);
create index if not exists idx_simulated_shots_batch      on simulated_shots (batch_id);
create index if not exists idx_simulated_shots_club_carry on simulated_shots (club, carry_yds);

-- Row level security is ON for these tables: anyone can read, only the
-- service-role key can write (supabase/simulator_rls_migration.sql).
