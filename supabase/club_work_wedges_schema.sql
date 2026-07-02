-- ============================================================
-- Golf OS — Club Work (per-session)
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Per-session club shot data (lightweight JSONB, like session_blocks.activities)
alter table practice_sessions
  add column if not exists club_work jsonb not null default '[]';
