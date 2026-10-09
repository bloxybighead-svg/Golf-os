-- Exceptional score reduction (Rule 5.9) and soft/hard cap (Rule 5.8) notes.
-- Run once in the Supabase SQL editor (project clgjzoedmtguchilmkdj), BEFORE or
-- after deploying; until it has run the app still saves the index, just
-- without these two notes. No new tables or policies: two columns on
-- handicap_tracking, which already has owner-only RLS (handicap_tracking.sql).
alter table public.handicap_tracking add column if not exists esr_adjustment numeric(3, 1);  -- Rule 5.9 total acting on the index; 0 or negative
alter table public.handicap_tracking add column if not exists cap_applied text;               -- 'soft' | 'hard' | null (Rule 5.8)
alter table public.handicap_tracking drop constraint if exists handicap_tracking_cap_applied_check;
alter table public.handicap_tracking add constraint handicap_tracking_cap_applied_check
  check (cap_applied is null or cap_applied in ('soft', 'hard'));
