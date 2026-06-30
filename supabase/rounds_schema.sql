-- ============================================================
-- Golf OS — Rounds table
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists rounds (
  id             uuid default gen_random_uuid() primary key,
  date           date not null,
  course_name    text not null,
  score          integer not null,
  par            integer not null default 72,
  fairways_hit   integer,
  fairways_total integer,
  gir            integer check (gir between 0 and 18),
  total_putts    integer,
  notes          text,
  created_at     timestamptz default now()
);

-- RLS disabled for now (no auth yet — single-user app)
-- When you add Supabase Auth, re-enable with:
--   alter table rounds enable row level security;
--   create policy "owner" on rounds using (auth.uid() = user_id);
alter table rounds disable row level security;
