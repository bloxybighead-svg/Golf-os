// The first-run screen on Play: shown to someone with no course remembered on
// this device, no setup done here, and no saved setup on an account.

export function isFirstVisit({ hasLastCourse, onboarded, hasBaseline }: { hasLastCourse: boolean; onboarded: string | null; hasBaseline: boolean }): boolean {
  return !hasLastCourse && onboarded == null && !hasBaseline
}
