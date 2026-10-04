-- Session 14: the planner's bag and settings live in the golfer's account.
-- Run once in the Supabase SQL editor. Additive: existing rows keep working
-- (the new columns are null until the golfer next edits their bag).
-- RLS is unchanged: the owner-only policies on golfer_baseline (see
-- supabase/golfer_baseline.sql, same pattern as per_user_data.sql) already
-- cover every column of the row.
alter table public.golfer_baseline
  add column if not exists bag jsonb,        -- {"calibrated": ["Driver", ...], "handicap": ["Driver", ...]}
  add column if not exists tendency jsonb,   -- {"side": "auto", "strength": "moderate"}
  add column if not exists source text;      -- 'calibrated' or 'handicap': whose shots the planner uses

alter table public.golfer_baseline
  drop constraint if exists golfer_baseline_source_check;
alter table public.golfer_baseline
  add constraint golfer_baseline_source_check check (source is null or source in ('calibrated', 'handicap'));
