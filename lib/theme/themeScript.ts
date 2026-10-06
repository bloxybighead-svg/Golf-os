import { THEME_STORAGE_KEY } from "./preference"

// Runs in <head> before first paint (app/layout.tsx) so a pinned Light/Dark never flashes.
// next.config.mjs allows exactly this string in its Content-Security-Policy by sha256 hash;
// lib/theme/themeScript.test.ts fails if the two drift apart.
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`
