-- Tiger 5: two optional answers per hole, asked only after a bogey or worse on a hole that was not tracked shot by shot.
-- Additive: two nullable columns, no policy change, nothing deleted. Run in the Supabase SQL editor.
alter table public.round_holes add column if not exists wedge_in_hand boolean;         -- a 9-iron or less was in hand for the shot that went wrong
alter table public.round_holes add column if not exists easy_updown_missed boolean;    -- an easy up-and-down was blown
