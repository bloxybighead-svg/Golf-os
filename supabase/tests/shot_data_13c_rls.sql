-- RLS check for session 13c: acts as user A (a real account) and user B (a
-- random one), tries to cross the line, then ROLLS EVERYTHING BACK by raising an
-- error whose message is the result table. Run in the Supabase SQL editor after
-- shot_data_13c.sql. Replace the uuid with any real auth.users id.
--
-- Expected: every row "ok": true. "B reads none of A shots" is false until
-- shot_data_13c_lockdown.sql has removed the old public read on real_shots.
do $$
declare
  a uuid := 'b36e19f7-9a6d-409a-a836-512a9ef88c26';
  b uuid := gen_random_uuid();
  sid uuid;
  n int;
begin
  create temp table res(test text, ok boolean) on commit drop;
  grant all on res to authenticated, anon;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into shot_sessions(label) values ('rls-test') returning id into sid;
  insert into real_shots(user_id, session_id, session_label, club, carry_yds, offline_yds) values (a, sid, 'rls-test', '7-Iron', 150, 1);
  insert into shot_profiles(club, params, n_shots, sessions_used) values ('7-Iron', '{}', 1, 1);
  select count(*) into n from shot_sessions where label = 'rls-test'; insert into res values ('A can write and read own session', n = 1);
  begin
    insert into real_shots(user_id, session_label, club, carry_yds, offline_yds) values (b, 'x', '7-Iron', 1, 1);
    insert into res values ('A cannot insert a shot as B', false);
  exception when sqlstate '42501' then insert into res values ('A cannot insert a shot as B', true); end;
  begin
    insert into shot_sessions(user_id, label) values (b, 'x');
    insert into res values ('A cannot insert a session as B', false);
  exception when sqlstate '42501' then insert into res values ('A cannot insert a session as B', true); end;
  begin
    insert into shot_profiles(user_id, club, params, n_shots, sessions_used) values (b, '7-Iron', '{}', 1, 1);
    insert into res values ('A cannot insert a profile as B', false);
  exception when sqlstate '42501' then insert into res values ('A cannot insert a profile as B', true); end;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from shot_sessions; insert into res values ('B reads none of A sessions', n = 0);
  select count(*) into n from shot_profiles; insert into res values ('B reads none of A profiles', n = 0);
  select count(*) into n from real_shots where user_id = a; insert into res values ('B reads none of A shots (needs lockdown step)', n = 0);
  update shot_sessions set label = 'hacked' where id = sid; get diagnostics n = row_count; insert into res values ('B cannot update A session', n = 0);
  delete from shot_sessions where id = sid; get diagnostics n = row_count; insert into res values ('B cannot delete A session', n = 0);
  update shot_profiles set n_shots = 99 where user_id = a; get diagnostics n = row_count; insert into res values ('B cannot update A profile', n = 0);
  begin
    insert into real_shots(user_id, session_id, session_label, club, carry_yds, offline_yds) values (b, sid, 'x', '7-Iron', 1, 1);
    insert into res values ('B cannot attach a shot to A session', false);
  exception when sqlstate '42501' then insert into res values ('B cannot attach a shot to A session', true); end;

  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from shot_sessions; insert into res values ('anon reads no sessions', n = 0);
  select count(*) into n from shot_profiles; insert into res values ('anon reads no profiles', n = 0);

  reset role;
  raise exception 'RLS RESULTS: %', (select json_agg(res) from res);
end $$;
