-- Indexes for foreign keys the Supabase "unindexed_foreign_keys" advisor lists. The unused-index
-- findings are left alone for now: nothing is dropped here.
create index if not exists course_corrections_user_id_idx on public.course_corrections (user_id);
create index if not exists real_shots_session_id_idx on public.real_shots (session_id);
create index if not exists session_blocks_drill_id_idx on public.session_blocks (drill_id);
create index if not exists session_blocks_session_id_idx on public.session_blocks (session_id);
create index if not exists user_drills_drill_id_idx on public.user_drills (drill_id);
