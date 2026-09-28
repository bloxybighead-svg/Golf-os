# Golf OS design

## Direction

The look to aim for is a yardage book: paper-light, one ink color, numbers
big, everything else quiet. It should feel closer to a Garmin or Apple
Weather screen than to a SaaS dashboard.

### Information architecture

| Today | After |
|---|---|
| Home, Practice, Rounds, Course Planner, Sign in + 5 planner sub-tabs | 3-tab bottom bar: Play (planner), Rounds, You |
| Practice tab | Deleted; drills live under You |
| Dispersion, Custom golfer, Compare golfers, Tee box | You → My bag (clubs + dispersion), Compare lives inside My bag |
| Home dashboard of 6+ cards | You: handicap hero, strengths/weaknesses, next drill |
| Sign in in the nav | Full-screen sign-in once; avatar in You after that |

### Rules for the visual system

- **Light first, sun-readable, with a dark toggle.** Background off-white
  (#F7F6F2 range), text near-black, contrast 7:1 for anything read on
  course. New or signed-out sessions follow the device's system light/dark
  setting rather than hardcoding dark, so a stranger opening it on the
  range at noon lands on something readable. A persisted light/dark toggle
  in Settings lets you run it dark whenever you want. The requirement was
  never "no dark mode"; it's that dark can't be the only option, since
  that's the one mode that fails outdoors.
- **One accent.** A single deep green or a single signal color for the
  recommended club and aim. Everything else is grayscale. Map terrain
  colors are the only other hues, and they're muted.
- **One typeface, tabular numbers.** Inter or Geist is fine if you use it
  deliberately: numbers at 32–56px semibold with tabular figures, labels
  at 13px uppercase-tracked gray. No mixing weights beyond 400/600.
- **Numbers are the hero.** Every screen has one big number (recommended
  club + projected strokes on Play, handicap on You, score on a round) and
  small supporting stats.
- **Rows, not cards.** Lists with hairline dividers. A card only when the
  whole thing is tappable.
- **No decoration.** No gradients, glows, emoji, drop shadows, pill badges
  on everything, or icons next to every label.
- **8px spacing grid, 44px minimum touch targets, 16px side gutters on
  phone.**
- **Real markers.** Ball = small white ball with shadow ring, aim =
  crosshair, pin = flag. Dispersion dots semi-transparent, the ellipse
  drawn once.

### Copy rules

- Labels are nouns: "Handicap", "Last round", "Best club". Never "Where
  your game stands right now".
- No em-dash taglines, no "unlock", "insights", "supercharge",
  "seamlessly".
- Empty states say what to do in five words or fewer and give the button:
  "No rounds yet. Add round."
- No instructions on the planner. Teach by opening on a real hole with the
  ball already placed.
- Golfer words, not model words: "your misses" not "dispersion model",
  "shots" not "simulated shots".

## Where the app stands (2026-09-28)

Done: three-tab nav (R1), drills under You, bag tools under `/you/bag`,
every color a token (R2), system light/dark with the Appearance toggle,
paper palette at 7:1, one accent, decorative gradients removed.

Not yet applied (candidates for the next R-steps):

- **Play isn't the planner yet.** R1 pointed Play at the old Home
  dashboard (`/`), with the planner at `/planner` under the same tab.
  Direction: Play *is* the planner, and the handicap, strengths/weaknesses
  and next-drill content moves to You.
- **My bag** is "Your Bag" on `/you/bag` with four tools (Dispersion,
  Compare, Custom, Tee box). Direction: clubs + dispersion, with Compare
  inside, and no mention of Custom golfer or Tee box.
- **Typography:** Geist isn't actually loaded (system UI font), no
  tabular figures, and 500/700 weights are used widely.
- **Cards and decoration:** the app is card-based with `shadow-sm`, pill
  chips, and icons beside most labels.
- **Copy:** Play's subtitle is literally "Where your game stands right
  now", the Insight card says "Log more rounds to unlock insights", the
  planner has a "How it works" panel, and labels say "simulated shots" and
  "Dispersion".
- **Markers:** ball/aim/pin are lettered circles (B/A/P), not a ball,
  crosshair and flag.
- **Touch targets:** `globals.css` enforces 40px on coarse pointers, not 44px.

## Tokens

All colors live in `app/globals.css` as CSS variables (RGB channels) and
are exposed as Tailwind colors in `tailwind.config.ts`. **Never write a
hex, `rgb()`, or palette color like `text-red-400` in `app/` or
`components/`.** Use a token utility instead. This must return nothing:

```bash
grep -rE "#[0-9a-fA-F]{3,6}" app components
```

Contrast is measured against `page` and `surface`. Everything read on
course is at least 7:1 in both themes, except `faint`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `page` | #F7F6F2 | #0A0A0A | Paper: app background, nav bars |
| `surface` | #FFFFFF | #111111 | Cards (tappable) |
| `surface-2` | #FBFAF7 | #161616 | A card inside a card |
| `surface-3` | #EFEEE9 | #1A1A1A | Inputs, buttons, chips |
| `surface-4` | #E6E4DD | #1E1E1E | Hover on surface-3, tracks |
| `line` | #E2E0D9 | #2A2A2A | Solid dividers |
| `fg` | #1A1A17 (16:1) | #FFFFFF | Primary text. At low opacity, hairlines (`border-fg/[0.06]`) and hover washes |
| `fg-2` | #36352F (11:1) | #D1D5DB | Strong secondary text |
| `fg-3` | #46443F (9:1) | #B0B6C0 | Secondary text |
| `muted` | #504E48 (7.7:1) | #9CA3AF (7.4:1) | Labels, captions, `.label-xs` |
| `faint` | #8A877F | #6B7280 | **Placeholders and disabled only.** Never readable text |
| `accent` | #15602F (7.1:1) | #22C55E | The one accent: primary action, recommended club, aim, active tab |
| `accent-hi` | #0F4A24 | #4ADE80 | Accent hover and emphasis |
| `on-accent` | white (7.7:1) | black (9.2:1) | Text on an accent fill |
| `danger` / `warn` / `info` | 7:1+ | 7:1+ | Errors, warnings, notices (`text-danger`, `bg-warn/10 border-warn/40`) |
| `viz-blue` / `viz-orange` / `viz-yellow` | | | Extra chart series (accent is series 1) |
| `lie-*`, `map-*` | same in both | | Course map layers over satellite imagery. Not themed |

### Outside Tailwind classes

`lib/theme/tokens.ts` covers the places a class can't reach:

- `cssColor(name, alpha?)` returns `rgb(var(--name) / alpha)` for `style={{}}` and HTML strings.
- `useThemeColor()` returns a function for SVG and chart attributes (recharts, the dispersion plots). It resolves concrete values after mount and re-renders when the theme changes, because older Safari doesn't resolve `var()` inside SVG presentation attributes.
- `readColor(name, alpha?)` returns a concrete value right now, for Leaflet layers (drawn on a canvas, which can't use `var()`).

**Fixed colors on imagery.** Glass controls over the satellite map (HUD,
draw buttons, compass) use fixed `text-white`, `text-gray-400`,
`bg-black/75` and `border-white/25`, because they sit on the photo, not
the page.

**The one exception.** `lib/brand.ts` holds literal hex for the web app
manifest, the `theme-color` meta tag and `public/icon.svg`, which can't
read CSS. Keep it matched to `--page` and `--accent`.

## Theme mechanics

- `:root` holds the light values. Dark values apply under
  `@media (prefers-color-scheme: dark)` unless `html[data-theme="light"]`,
  and under `html[data-theme="dark"]`. **Both dark blocks must stay in
  sync.**
- The Appearance setting (You page; `components/you/AppearanceSetting.tsx`,
  `lib/theme/preference.ts`) stores `golf-os-theme` in localStorage, per
  device. An inline script in `app/layout.tsx` applies it before first
  paint, so there's no flash of the wrong theme.
