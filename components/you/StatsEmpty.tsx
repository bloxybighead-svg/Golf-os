import Link from "next/link"

/** Everything on Stats needs a round, so with none it is one card and one button. */
export function StatsEmpty({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <h2 className="text-base font-semibold text-fg">Your stats start with one round</h2>
      <p className="mt-2 text-sm text-fg-2">After 1 round: strokes gained and Tiger 5</p>
      <p className="text-sm text-fg-2">After 3 rounds: handicap estimate</p>
      <Link
        href={signedIn ? "/rounds?new=1" : "/login?redirect=%2Fyou%2Fstats"}
        className="mt-4 inline-flex min-h-[44px] items-center rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent hover:brightness-110"
      >
        Add round
      </Link>
    </div>
  )
}
