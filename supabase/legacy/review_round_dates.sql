-- One-off, read-only. Lists rounds whose `date` is one day AFTER the New Jersey
-- calendar day they were created on, the pattern the old UTC "today" produced
-- for rounds logged in the evening. Review by hand; nothing here changes data.
-- Run in Supabase Dashboard -> SQL Editor.
select
  id,
  user_id,
  date,
  (created_at at time zone 'America/New_York')::date as created_nj_date,
  created_at,
  course_name,
  score
from rounds
where (created_at at time zone 'America/New_York')::date = date - 1
order by date desc;
