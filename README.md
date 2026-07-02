# Golf OS

Personal golf practice and performance tracker built for a competitive junior golfer.

**Live:** [golf-os-ten.vercel.app](https://golf-os-ten.vercel.app) — auto-deploys from `main` via Vercel.

## Stack

- **Next.js 14** — App Router, TypeScript
- **Tailwind CSS** — dark theme, custom design system
- **Supabase** — Postgres database + auth (future)

## Project Structure

```
golf-os/
├── app/
│   ├── layout.tsx          # Root layout: NavBar + dark theme
│   ├── page.tsx            # Home / landing
│   ├── log/                # Practice log: 3-step session builder, detail view, Club Work
│   ├── drills/             # Drill library: CRUD, categories, usage counts
│   ├── rounds/             # Round tracking: scores, differentials, pressure-collapse flags
│   └── trends/             # Charts: differential, FIR/GIR, putts, milestones, CSV export
├── components/             # Feature components (log/, rounds/, trends/) + NavBar
├── lib/
│   └── supabase/
│       ├── client.ts       # Browser Supabase client (use in Client Components)
│       └── server.ts       # Server Supabase client (use in Server Components / API routes)
├── supabase/               # SQL schema / migration files (run manually in Supabase)
├── .env.local              # Supabase keys — never committed
└── tailwind.config.ts      # Custom color tokens: surface, accent (green), muted
```

## Color System

| Token | Value | Use |
|---|---|---|
| `surface` | `#0f0f0f` | Page background |
| `surface-1` | `#161616` | Subtle backgrounds |
| `surface-2` | `#1e1e1e` | Cards, inputs |
| `surface-3` | `#262626` | Hover states |
| `border` | `#2a2a2a` | Dividers |
| `accent` | `#4ade80` | Golf green — CTAs, active states |
| `muted` | `#6b7280` | Secondary text |

## Setup

### 1. Install Node.js
Download from [nodejs.org](https://nodejs.org) — LTS version recommended.

### 2. Install dependencies
```bash
npm install
```

### 3. Set up Supabase
Create a free project at [supabase.com](https://supabase.com), then add your keys:

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 4. Run dev server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

1. **Log** — practice sessions with a 3-step builder (header → blocks → ratings), per-block activities, and an editable Club Work section (carry/dispersion/spin per club)
2. **Drills** — user-curated drill library with categories and usage counts pulled from logged sessions
3. **Rounds** — full round tracking: score, differential, competitive flag, GHIN-style stats, and pressure-collapse flags (tournament differential spike, GIR collapse vs. casual baseline)
4. **Trends** — recharts dashboards: rolling-average differential, FIR/GIR, putts + 3-putt %, practice frequency, milestone markers, and CSV export
