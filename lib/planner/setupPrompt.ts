// The "plan with your own clubs" setup banner on Play. It shows on the first
// few visits, then collapses to a small dot on the You tab (where setup lives).
// The counting and rules are pure; the storage helpers wrap localStorage.

import { ONBOARDED_KEY } from "@/lib/golfer/baseline"

export const SETUP_PROMPT_KEY = "golfos.setupPrompt.v1"
/** Window event fired when the prompt state changes, so the nav dot updates without a reload. */
export const SETUP_PROMPT_EVENT = "golfos:setup-prompt"
/** How many Play visits show the banner before it collapses to a dot. Brief: "after 3 views". */
export const SETUP_PROMPT_MAX_VIEWS = 3

export interface SetupPromptState {
  views: number
  dismissed: boolean
}

export const FRESH_PROMPT: SetupPromptState = { views: 0, dismissed: false }

export function bannerVisible(s: SetupPromptState): boolean {
  return !s.dismissed && s.views <= SETUP_PROMPT_MAX_VIEWS
}

/** The collapsed form: a dot on the You tab, for as long as setup is still undone. */
export function dotVisible(s: SetupPromptState, setupDone: boolean): boolean {
  return !setupDone && !bannerVisible(s)
}

export function recordView(s: SetupPromptState): SetupPromptState {
  return { ...s, views: s.views + 1 }
}

export function dismissed(s: SetupPromptState): SetupPromptState {
  return { ...s, dismissed: true }
}

export function parsePrompt(raw: string | null): SetupPromptState {
  if (!raw) return FRESH_PROMPT
  try {
    const v = JSON.parse(raw)
    const views = Number(v?.views)
    return { views: Number.isFinite(views) && views >= 0 ? Math.floor(views) : 0, dismissed: v?.dismissed === true }
  } catch {
    return FRESH_PROMPT
  }
}

/** Reads the state from this device. An older "dismissed" flag counts as dismissed. */
export function readPrompt(): { state: SetupPromptState; setupDone: boolean } {
  try {
    const onboarded = localStorage.getItem(ONBOARDED_KEY)
    const state = parsePrompt(localStorage.getItem(SETUP_PROMPT_KEY))
    return { state: onboarded === "dismissed" ? dismissed(state) : state, setupDone: onboarded === "1" }
  } catch {
    return { state: FRESH_PROMPT, setupDone: false }
  }
}

export function writePrompt(s: SetupPromptState): void {
  try {
    localStorage.setItem(SETUP_PROMPT_KEY, JSON.stringify(s))
    window.dispatchEvent(new Event(SETUP_PROMPT_EVENT))
  } catch {
    /* it just comes back next visit */
  }
}
