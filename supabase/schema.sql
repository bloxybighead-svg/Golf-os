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
  activities       jsonb not null default '[]'::jsonb,
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

-- Seed drills: add your own via the app or paste an insert block here
