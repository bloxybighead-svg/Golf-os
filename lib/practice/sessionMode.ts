// Session mode: the runner's page becomes one full-screen layout on phones, the same way a round does
// (lib/rounds/roundMode.ts, whose pause flag and compact query it shares).

import { SESSION_PATH, type ActiveSession } from "./activeSession"

export function inSessionMode(session: ActiveSession | null, pathname: string, isPaused: boolean): boolean {
  return session != null && !isPaused && pathname === SESSION_PATH
}
