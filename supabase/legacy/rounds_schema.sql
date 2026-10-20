-- ============================================================
-- Golf OS — Rounds table
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists rounds (
  id             uuid default gen_random_uuid() primary key,
  date           date not null,
  course_name    text not null,
  score          integer not null,
  par            integer not null default 72,
  fairways_hit   integer,
  fairways_total integer,
  gir            integer check (gir between 0 and 18),
  total_putts    integer,
  notes          text,
  created_at     timestamptz default now()
);

-- Row level security is ON for this table, with owner-only policies
-- (supabase/per_user_data.sql). Never disable it: that would expose every
-- golfer's rows to anyone with the public key.
