# Golf OS design

> **Draft.** R2 asked for this file to be written from the planning doc's
> "Design Direction" section, which wasn't available when it was written.
> It describes the system as built in R2. Replace or merge in that
> section's wording when you have it.

## Principles

- **Calm, data-first.** Numbers are the product. Cards are quiet
  containers; color is reserved for meaning (the accent, good/bad deltas,
  status), not decoration.
- **One accent.** Golf green (`accent`) marks the primary action, the
  active tab, and "better." There is no second brand color.
- **No decorative gradients, no emoji.** Flat fills and hairline borders.
  The one gradient left is functional: the course map's
  better-to-worse color-scale key.
- **Phone first, not phone only.** Every screen works at 375px with the
  bottom tab bar in thumb reach. On desktop, use the width: side-by-side
  cards (`lg:grid-cols-2`) rather than one stretched column.
- **Light and dark are equals.** The app follows the device's setting by
  default, and You → Appearance can pin Light or Dark.

## Tokens

All colors live in `app/globals.css` as CSS variables (RGB channels) and
are exposed as Tailwind colors in `tailwind.config.ts`. **Never write a
hex, `rgb()`, or palette color like `text-red-400` in `app/` or
`components/`.** Use a token utility instead. This should return nothing:

```bash
grep -rE "#[0-9a-fA-F]{3,6}" app components
```

| Token | Use | Utility examples |
|---|---|---|
| `page` | App background, nav bars | `bg-page`, `bg-page/90` |
| `surface` | Cards | `bg-surface` |
| `surface-2` | A card inside a card | `bg-surface-2` |
| `surface-3` | Inputs, buttons, chips | `bg-surface-3` |
| `surface-4` | Hover on surface-3, tracks | `hover:bg-surface-4` |
| `line` | Solid dividers and outlines | `border-line` |
| `fg` | Primary text. At low opacity, hairline borders and hover washes | `text-fg`, `border-fg/[0.06]`, `hover:bg-fg/[0.05]` |
| `fg-2` | Strong secondary text | `text-fg-2` |
| `fg-3` | Secondary text | `text-fg-3` |
| `muted` | Labels, captions | `text-muted`, `.label-xs` |
| `faint` | Placeholders, disabled, empty-state hints | `text-faint`, `placeholder:text-faint` |
| `accent` | Primary buttons, active states, "better" | `bg-accent text-on-accent`, `text-accent`, `bg-accent/10` |
| `accent-hi` | Accent text emphasis and hover | `hover:text-accent-hi` |
| `on-accent` | Text on an accent fill | `text-on-accent` |
| `danger` / `warn` / `info` | Errors, warnings, notices | `text-danger`, `bg-warn/10 border-warn/40` |
| `viz-blue` / `viz-orange` / `viz-yellow` | Extra chart series (accent is series 1) | chart props via `useThemeColor` |
| `lie-*`, `map-*` | Course map layers over satellite imagery. **Not themed** (the imagery doesn't change) | via `readColor` / `lieColor` |

Opacity conventions: borders `fg/[0.06]` (default) to `fg/[0.1]`
(emphasized); status tints `token/10` fill with `token/40` border.

### Outside Tailwind classes

`lib/theme/tokens.ts` covers the places a class can't reach:

- `cssColor(name, alpha?)` returns `rgb(var(--name) / alpha)` for `style={{}}` and HTML strings.
- `useThemeColor()` returns a function for SVG and chart attributes (recharts, the dispersion plots). It resolves concrete values after mount and re-renders when the theme changes, because older Safari doesn't resolve `var()` inside SVG presentation attributes.
- `readColor(name, alpha?)` returns a concrete value right now, for Leaflet layers (drawn on a canvas, which can't use `var()`).

**Fixed colors on imagery.** Glass controls over the satellite map (HUD,
draw buttons, compass) use fixed `text-white`, `text-gray-400`, `bg-black/75` and
`border-white/25`, because they sit on the photo, not the page.

**The one exception.** `lib/brand.ts` holds literal hex for the web app
manifest, the `theme-color` meta tag and `public/icon.svg`, which can't
read CSS. Keep it matched to `--page` and `--accent`.

## Theme mechanics

- `:root` holds the light values. Dark values apply under
  `@media (prefers-color-scheme: dark)` unless `html[data-theme="light"]`,
  and under `html[data-theme="dark"]`. **Both dark blocks must stay in
  sync.**
- The Appearance setting (`components/you/AppearanceSetting.tsx`,
  `lib/theme/preference.ts`) stores `golf-os-theme` in localStorage, per
  device. An inline script in `app/layout.tsx` applies it before first
  paint, so there's no flash of the wrong theme.

## Type and shape

- System UI sans. Page titles `text-2xl font-bold tracking-tight`; card
  labels `.label-xs` (uppercase, tracked, muted); body `text-sm`; captions
  `text-xs text-muted`.
- Cards: `rounded-xl border border-fg/[0.06] bg-surface px-5 py-4 shadow-sm`.
- Controls: `rounded-lg`; touch targets at least 40px on coarse pointers
  (enforced in `globals.css`).
