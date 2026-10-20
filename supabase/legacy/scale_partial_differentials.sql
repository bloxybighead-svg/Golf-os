-- Applied to project clgjzoedmtguchilmkdj (migration: scale_partial_differentials), 2026-09-30.
-- Rounds of 9-17 holes used to store the raw differential for the holes
-- played, about half an 18-hole one for 9 holes, and the handicap estimate
-- averaged them with 18-hole rounds as equals. They're now scaled to an
-- 18-hole differential (x 18 / holes played), the same as lib/handicap.ts
-- calcDifferential does for every new save. Under 9 holes: no differential.
-- Changed 21 rounds (20 nine-hole, 1 ten-hole); the old value is this one
-- x holes_played / 18. Estimate over the last 20: 2.2 -> 3.0.
update public.rounds
set differential = round(((score - course_rating) * 113 / slope_rating * 18.0 / holes_played)::numeric, 1)
where holes_played between 9 and 17
  and course_rating is not null
  and slope_rating is not null
  and slope_rating > 0;

update public.rounds
set differential = null
where holes_played < 9 and differential is not null;
