-- "Log practice" on /you/practice writes a completed user_drills row for any drill or for free practice.
-- Additive only: free practice has no library drill, and minutes/rating are new.
alter table public.user_drills alter column drill_id drop not null;
alter table public.user_drills add column if not exists minutes integer check (minutes is null or minutes > 0);
alter table public.user_drills add column if not exists rating smallint check (rating is null or rating between 1 and 5);
