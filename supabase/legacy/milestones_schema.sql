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

-- Row level security is ON for this table, with owner-only policies
-- (supabase/per_user_data.sql). Never disable it: that would expose every
-- golfer's rows to anyone with the public key.
