"use client"

const CLUBS = [
  "Driver", "3W", "7W", "4i", "5i", "6i", "7i", "8i", "9i", "PW", "GW", "56", "60", "Putter",
]

interface Props {
  value: string[]
  onChange: (clubs: string[]) => void
  allowedClubs?: string[]
}

export function ClubPicker({ value, onChange, allowedClubs }: Props) {
  const toggle = (club: string) =>
    onChange(value.includes(club) ? value.filter((c) => c !== club) : [...value, club])

  const visible = allowedClubs ? CLUBS.filter((c) => allowedClubs.includes(c)) : CLUBS

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((club) => (
        <button
          key={club}
          type="button"
          onClick={() => toggle(club)}
          className={[
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value.includes(club)
              ? "border-accent bg-accent text-on-accent"
              : "border-line text-muted hover:border-fg hover:text-fg",
          ].join(" ")}
        >
          {club}
        </button>
      ))}
    </div>
  )
}
