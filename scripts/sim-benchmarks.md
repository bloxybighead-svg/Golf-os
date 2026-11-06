# Published amateur benchmarks used by `npm run sim:validate`

Every number below was read from the page named. Where a stat is not published (or could not be read), it says so; nothing is estimated.
Pages marked *snippet* returned 403 to a direct fetch, so the figure comes from the search-result summary of that page, not from the page itself.

## Fairways hit

| Source | Group | Fairways hit | Note |
|---|---|---|---|
| Arccos 2026 Driving Distance Report, via [MyGolfSpy](https://mygolfspy.com/news-opinion/6-insights-from-the-arccos-driver-distance-report/) *(snippet)* | 0 to 4.9 | 49.3% | driver tee shots |
| same | 10 to 14.9 | 45.3% | |
| same | 30+ | 40.6% | |
| [The Left Rough](https://theleftrough.com/golf-statistics-by-handicap/) (quoting Golf Monthly / Arccos) | scratch | 51% | older Arccos data |
| same | ~5 | 49% | [Golf Monthly: 7 surprising stats about 5 handicappers](https://www.golfmonthly.com/features/7-surprising-stats-about-5-handicap-golfers): 49.7% with driver |
| same | ~18 | 42% | |
| same | 20+ | 41% | |
| [Lou Stagner on X](https://x.com/LouStagner/status/1683870186997157891) | 10 | 7.1 of 14 fairways on good rounds, 6.3 on bad ones (about 45% to 51%) | |

## Tee shots in trouble

Published: the share of **driver tee shots ending in penalty OR recovery** (not OB + water alone).

| Source | Group | Value |
|---|---|---|
| [Arccos 2026 Driving Distance Report](https://www.arccosgolf.com/blogs/community/arccos-golf-releases-largest-ever-annual-driving-distance-report-leveraging-data-from-25-million-rounds-to-deliver-eight-year-trend-analysis-across-age-gender-and-skill-level) (9.7M driver tee shots, par 4/5) | 0 to 4.9 | 12% (88% kept in play) |
| same | 30+ | 45.1% |

**Not published (not found): the OB + water rate per drive, by handicap.** The closest published figures are per round:

| Source | Group | Penalty strokes per round |
|---|---|---|
| [MyGolfSpy, Arccos data](https://mygolfspy.com/news-opinion/the-secret-weapon-every-tour-pro-uses-and-most-amateurs-ignore/) *(snippet)* | scratch to 5 | 1.03 |
| same | 15 | 1.66 (41% of rounds have 2+) |
| Lou Stagner, Arccos (via [Golf Monthly](https://golfmonthly.com/features/how-many-strokes-do-amateur-golfers-lose-each-round-due-to-wayward-shots-the-numbers-paint-an-interesting-picture)) | 10 | 3+ penalty shots in about 25% of rounds |

These count every shot of the round (approaches, chips, all hazards), so they are an upper bound on the tee-shot rate, not a match for it.

## Greens in regulation

| Source | Group | GIR |
|---|---|---|
| [Golf.com, Lou Stagner / Arccos](https://golf.com/instruction/greens-in-regulation-by-handicap-play-smart/) (average rounds; the article gives greens per round, converted here by dividing by 18) | ~0 | 56.1% |
| same | 5 to 7 | 42.2% |
| same | 11 to 13 | 29.4% |
| same | 17 to 19 | 22.8% |

(Golf Monthly's 2026 Shot Scope piece gives 41% for a 5 and 21% for a 15; the two sources differ by a few points.)

## Average score versus par

**Not found as a published per-handicap table.** The only anchor is the Left Rough's remark that an average of 90 usually means a 10 to 14 handicap. The model's own anchor (lib/course/baseline.ts) is Broadie 2008, quoted in Interfaces 2012, 3.1: a 90 golfer's average score from the tee is 2.79 + 0.0066 x hole length.

## Strokes to hole out from the fairway (Broadie)

**Not obtained.** Broadie's amateur fairway table (*Every Shot Counts*, and "Assessing Golfer Performance Using Golfmetrics") could not be read from any page the search reached. The model's baseline is built from the cited 90 golfer and tour lines and is compared with them in the report, not with a Broadie table.
