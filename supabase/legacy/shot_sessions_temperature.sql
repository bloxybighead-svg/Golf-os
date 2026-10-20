-- Air temperature per shot session. ADDITIVE ONLY: one nullable column, nothing
-- dropped or changed. Run in the Supabase SQL editor (project
-- clgjzoedmtguchilmkdj). Safe to run twice.
--
-- The golfer's carries were measured at some temperature; the planner's
-- plays-like adjusts for today's air relative to it (lib/course/playsLike.ts,
-- lib/shots/temperature.ts). Null = unknown. Indoor sessions are entered as 70
-- by the app. The existing owner-only RLS policies on shot_sessions
-- (shot_data_13c.sql) cover the new column; no policy change is needed.

alter table public.shot_sessions add column if not exists temperature_f numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shot_sessions_temperature_f_check') then
    alter table public.shot_sessions
      add constraint shot_sessions_temperature_f_check
      check (temperature_f is null or temperature_f between -20 and 120);
  end if;
end $$;
