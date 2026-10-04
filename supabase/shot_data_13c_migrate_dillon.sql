-- Session 13c, step 2 of 3: give the existing "Dillon Cady" shots to
-- dilloncady@yahoo.com. Run AFTER shot_data_13c.sql. Safe to run twice (it only
-- touches rows that have no owner yet).
--
-- It makes one shot_session per (session_label, shot_date) -- 23 of them -- and
-- points the shots at them. Club names are left as they are ("56 (SW)",
-- "60 (LW)"): the app normalizes them on read, and the live Compare page still
-- matches on the old names until the new code is deployed.
--
-- The sessions are recorded as outdoor / mat, which is a guess. If your range
-- sessions were indoors or on grass, change them on You > My bag > My shot data
-- (each session has the two selectors), or edit the two literals below first.
-- The fitted profile is not made here: it is fitted from these rows by the app's
-- own code (lib/golfer/shotProfile.ts) so the fit never drifts from SQL.

do $$
declare
  uid uuid;
  legacy_name constant text := 'Dillon Cady';
  env constant text := 'outdoor';
  surf constant text := 'mat';
begin
  select id into uid from auth.users where email = 'dilloncady@yahoo.com';
  if uid is null then
    raise exception 'No account for dilloncady@yahoo.com';
  end if;

  insert into public.shot_sessions (user_id, label, session_date, environment, surface)
  select uid, s.session_label, s.shot_date, env, surf
  from (
    select distinct session_label, shot_date
    from public.real_shots
    where golfer_name = legacy_name and user_id is null
  ) s
  where not exists (
    select 1 from public.shot_sessions x
    where x.user_id = uid and x.label = s.session_label and x.session_date is not distinct from s.shot_date
  );

  update public.real_shots r
  set user_id = uid, session_id = s.id
  from public.shot_sessions s
  where r.golfer_name = legacy_name
    and r.user_id is null
    and s.user_id = uid
    and s.label = r.session_label
    and s.session_date is not distinct from r.shot_date;
end $$;

-- Check: 589 shots, 23 sessions, none left without an owner.
select count(*) as shots, count(distinct session_id) as sessions, count(*) filter (where user_id is null) as unowned
from public.real_shots where golfer_name = 'Dillon Cady';
