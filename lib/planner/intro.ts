// The first-visit intro on Play: three short cards over the map, shown once per
// device. Skipping and finishing both count as seen. It never opens while a
// round is active (no overlays on the course), but stays unseen so it can
// still appear after the round.

/** Device flag: set once the intro was skipped or finished. */
export const INTRO_SEEN_KEY = "golfos.intro.v1"

export interface IntroCard {
  title: string
  body: string
}

export const INTRO_CARDS: readonly IntroCard[] = [
  {
    title: "The dots are shots",
    body: "Each dot is where one shot from a club landed. A tight cluster is a reliable club; a wide spray is a wide miss.",
  },
  {
    title: "Strokes to hole out",
    body: "The number is how many strokes it takes, on average, to finish the hole from the spot a shot ends up. Lower is better, and the best club is the one with the lowest number.",
  },
  {
    title: "Use your own clubs",
    body: "Until you add your carry distances and handicap, the dots are a sample golfer's. Set up your clubs so the dots and the recommendation match your game.",
  },
]

export interface IntroState {
  seen: boolean
  roundActive: boolean
}

/** Show the intro only to someone who hasn't seen it and isn't mid-round. */
export function shouldShowIntro({ seen, roundActive }: IntroState): boolean {
  return !seen && !roundActive
}

export function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === "1"
  } catch {
    // Storage blocked: treat as seen, so a blocked browser isn't nagged on every visit.
    return true
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, "1")
  } catch {
    /* blocked: it just can't be remembered */
  }
}
