-- practice_runs.location holds the places of a session ("range,putting_green"). Older rows hold labels that are not
-- places ("Mixed", "Wedge Focus", "other"): they become null, and a run may now have no location. No other data changes.
-- Run in the Supabase SQL editor.

alter table public.practice_runs alter column location drop not null;

update public.practice_runs
set location = null
where location is not null
  and not (string_to_array(location, ',') <@ array['home_net', 'short_game_area', 'putting_green', 'range', 'course', 'simulator']);
