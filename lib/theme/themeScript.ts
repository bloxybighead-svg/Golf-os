import { ACTIVE_ROUND_KEY } from "@/lib/rounds/activeRound"
import { THEME_STORAGE_KEY } from "./preference"

// Runs in <head> before first paint (app/layout.tsx) so nothing flashes: a pinned Light/Dark,
// and round mode (html[data-round], see hooks/useRoundMode.ts), whose header and tab bar must
// never show for a frame. The round check mirrors loadActiveRound's validity test.
// next.config.mjs allows exactly this string in its Content-Security-Policy by sha256 hash;
// lib/theme/themeScript.test.ts fails if the two drift apart.
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}try{var r=JSON.parse(localStorage.getItem("${ACTIVE_ROUND_KEY}")||"null");if(r&&r.course&&typeof r.course.id==="string"&&Array.isArray(r.holes)&&r.holes.length>0)document.documentElement.dataset.round=location.pathname==="/"?"1":"resume"}catch(e){}`
