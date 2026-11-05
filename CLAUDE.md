# Standing rules

1. Never commit to `main` directly. Create a branch named `fix/<short-topic>` for every task.
2. Before calling any task done, run in order: `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`. All must pass. If any fail, fix them; never skip or delete a test to make it pass.
3. After the checks pass, push the branch, then STOP and ask: "All checks pass on `<branch>`. Merge to main? Note: merging to main triggers `migrate.yml`, which applies Supabase migrations to production." Do not merge, push to `main`, or open and merge a PR until the answer is yes.
4. If a change adds or edits anything in `supabase/migrations`, say so explicitly in that question.
5. Never change the constants in `lib/course/strategy.ts` (`SMART_RISK_STROKES`, `SMART_MAX_PENALTY_RATE`, `ON_COURSE_SPREAD`) without showing the before/after effect and asking first.
