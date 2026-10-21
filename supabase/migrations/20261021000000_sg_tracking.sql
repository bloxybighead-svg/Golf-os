-- Strokes gained from the scorecard, and optional shot tracking. Additive: three columns, no policy change,
-- no rows or shots deleted. Run in the Supabase SQL editor.
alter table public.round_shots add column if not exists club_confirmed boolean not null default false;  -- true only when the golfer picked the club

alter table public.round_holes add column if not exists tracking text not null default 'none';          -- 'complete' | 'partial' | 'none', set on Hole done
alter table public.round_holes drop constraint if exists round_holes_tracking_check;
alter table public.round_holes add constraint round_holes_tracking_check check (tracking in ('complete', 'partial', 'none'));
alter table public.round_holes add column if not exists first_putt_ft smallint;                         -- the golfer's own first putt, feet
alter table public.round_holes drop constraint if exists round_holes_first_putt_ft_check;
alter table public.round_holes add constraint round_holes_first_putt_ft_check check (first_putt_ft is null or first_putt_ft between 1 and 150);

-- Holes of rounds that were tracked before this change cannot be trusted as complete (shots were recorded on ball moves).
update public.round_holes set tracking = 'partial'
where tracking = 'none' and round_id in (select distinct round_id from public.round_shots);
