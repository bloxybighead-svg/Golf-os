-- ============================================================
-- Golf OS — Milestones (Trends annotation markers)
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists milestones (
  id         uuid default gen_random_uuid() primary key,
  date       date not null,
  label      text not null,
  created_at timestamptz default now()
);

-- Single-user app, no auth yet
alter table milestones disable row level security;
