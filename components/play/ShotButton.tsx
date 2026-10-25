"use client"

/** "Track every shot": the large Shot button that records a swing with the club in hand. */
export function ShotButton({ club, onTap, disabled }: { club: string | null; onTap: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      aria-label={club ? `Shot with ${club}` : "Shot"}
      className="flex h-11 min-w-[88px] shrink-0 flex-col items-center justify-center rounded-lg bg-accent px-4 leading-tight text-on-accent transition-all hover:brightness-110 disabled:opacity-50"
    >
      <span className="text-base font-semibold">Shot</span>
      {club && <span className="max-w-[72px] truncate text-[10px]">{club}</span>}
    </button>
  )
}
