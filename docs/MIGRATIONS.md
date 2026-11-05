# Database migrations

Every file in `supabase/migrations/` is applied to the hosted project (ref `clgjzoedmtguchilmkdj`) by the **Migrate** workflow (`.github/workflows/migrate.yml`) when a push to `main` passes CI. Nobody runs SQL by hand.

## Adding a migration

```bash
npx supabase@latest migration new <name>
```

Write the SQL in the file it creates, and merge. Never edit a migration that has been applied; add a new one. Every migration must be safe to run twice: `create table if not exists`, `drop policy if exists` before `create policy`, `insert ... on conflict do nothing`, and updates guarded by a `where`. `lib/migrations.test.ts` fails on a bare `create table`, `insert` or `create policy`.

## GitHub secrets (one time)

Repository Settings -> Secrets and variables -> Actions -> New repository secret:

| Secret | Where to find it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com -> Account -> Access Tokens -> Generate new token |
| `SUPABASE_DB_PASSWORD` | the project's database password (Project Settings -> Database; reset it there if lost) |
| `SUPABASE_PROJECT_REF` | `clgjzoedmtguchilmkdj` |

With a secret missing, the Migrate workflow fails and names it. It never passes silently.

## One-time repair of the migration history

The hosted history and the repo files disagree: the dashboard and the SQL editor recorded some migrations under their own timestamps (for example `20261024101843` for `drill_library_v2`, and `practice_runs_single_source` twice), and `20261021000000_sg_tracking.sql` is applied but not recorded. `supabase db push` refuses to run until the two lists match. Run this once, locally, before the first merge that should deploy.

```bash
npx supabase@latest login
npx supabase@latest link --project-ref clgjzoedmtguchilmkdj
npx supabase@latest migration list
```

`migration list` shows local and remote side by side. Then forget every remote-only version, the timestamped copies of work that the files below already cover (everything before `20261012` is covered by `0001_baseline`):

```bash
npx supabase@latest migration repair --status reverted 20260901213747 20260901213800 20260909211154 20260926191505 20260926210403 20260927144100 20260927150843 20260927214830 20260927221437 20260927223416 20260928013459 20260928230723 20260930130507 20260930201548 20261001123255 20261001153301 20261004155752 20261004155753 20261004163134 20261004185632 20261004190730 20261005144347 20261005205429 20261005210919 20261006133354 20261008205344 20261012185039 20261012211120 20261024010325 20261024101843 20261024111831 20261025165150 20261025165202 20261105005523 20261105005605
```

Then record every repo file whose change is already in the database. `0001` to `0004` are already recorded and need nothing. `20261027000000` and `20261028000000` were run on the hosted project through the Supabase connector (the two `20261105...` versions above), so they are recorded here too instead of being pushed again:

```bash
npx supabase@latest migration repair --status applied 20261012000000 20261012000100 20261021000000 20261023000000 20261024000000 20261025000000 20261026000000 20261027000000 20261028000000
```

Finish with the check. Every row must show the same version in the Local and Remote columns, and none may be missing on either side:

```bash
npx supabase@latest migration list
```

If a version you did not expect is listed, do not guess: it is a migration that was applied outside this repo. Look at what it changed before choosing `reverted`.
