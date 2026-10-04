-- Session 13b. NOT YET APPLIED: run this in the Supabase SQL editor.
-- Which shot took the penalty on a hole: the tee shot, an approach, or
-- something else. Additive and nullable: existing rows and holes without a
-- penalty stay null. Only "tee" triggers the after-round question "Was it OB
-- left or right?" (a penalty with a missed fairway could just as well be water
-- on the approach). round_holes already has owner-only RLS (round_holes.sql);
-- a new column needs no new policy.
alter table public.round_holes
  add column if not exists penalty_shot text
  check (penalty_shot in ('tee', 'approach', 'other'));
