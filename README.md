# Golf OS

Personal golf practice and performance tracker built for a competitive junior golfer.

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
│   ├── log/page.tsx        # Practice log — PRIMARY FOCUS
│   ├── drills/page.tsx     # Drill library (stub)
│   ├── rounds/page.tsx     # Round scorecards (stub)
│   └── trends/page.tsx     # Performance trends (stub)
├── components/
│   └── NavBar.tsx          # Fixed top nav with active-link state
├── lib/
│   └── supabase/
│       ├── client.ts       # Browser Supabase client (use in Client Components)
│       └── server.ts       # Server Supabase client (use in Server Components / API routes)
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

## Build Order

1. **Log** — session logging, shot categories, notes (in progress)
2. **Drills** — structured drill library with completion tracking
3. **Rounds** — scorecard entry, GIR/FIR/putts per hole
4. **Trends** — charts and analytics across all data
