-- World Handicap System scoring (session 13). Run once in the Supabase SQL
-- editor (project clgjzoedmtguchilmkdj). No new tables: these are new
-- columns on rounds and round_holes, which already have owner-only RLS
-- (per_user_data.sql, round_holes.sql), so no policy changes are needed.

-- rounds: the adjusted gross score WHS uses, how it was capped, why a round
-- has (or doesn't have) a differential, and which course/tee it was on.
alter table public.rounds add column if not exists adjusted_score integer;          -- null = score-only round (posted as entered)
alter table public.rounds add column if not exists score_cap text;                  -- see check below
alter table public.rounds add column if not exists differential_status text;        -- see check below
alter table public.rounds add column if not exists course_id text;                  -- OpenGolfAPI course id, when picked from search
alter table public.rounds add column if not exists tee_name text;                   -- e.g. "Gold (Male)"

alter table public.rounds drop constraint if exists rounds_score_cap_check;
alter table public.rounds add constraint rounds_score_cap_check
  check (score_cap is null or score_cap in ('net_double_bogey', 'par_plus_5', 'approximate', 'none'));
alter table public.rounds drop constraint if exists rounds_differential_status_check;
alter table public.rounds add constraint rounds_differential_status_check
  check (differential_status is null or differential_status in ('rated', 'waiting_for_index', 'no_rating', 'too_short'));

-- round_holes: the hole's stroke index (1 = hardest), for net double bogey.
alter table public.round_holes add column if not exists stroke_index smallint;
alter table public.round_holes drop constraint if exists round_holes_stroke_index_check;
alter table public.round_holes add constraint round_holes_stroke_index_check
  check (stroke_index is null or stroke_index between 1 and 18);
