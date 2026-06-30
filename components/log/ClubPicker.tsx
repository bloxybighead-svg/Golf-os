"use client"

const CLUBS = [
  "Driver", "3W", "7W", "4i", "5i", "6i", "7i", "8i", "9i", "PW", "GW", "56", "60", "Putter",
]

interface Props {
  value: string[]
  onChange: (clubs: string[]) => void
}

export function ClubPicker({ value, onChange }: Props) {
  const toggle = (club: string) =>
    onChange(value.includes(club) ? value.filter((c) => c !== club) : [...value, club])

  return (
    <div className="flex flex-wrap gap-2">
      {CLUBS.map((club) => (
        <button
          key={club}
          type="button"
          onClick={() => toggle(club)}
          className={[
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value.includes(club)
              ? "border-[#4ade80] bg-[#4ade80] text-black"
              : "border-[#2a2a2a] text-[#6b7280] hover:border-white hover:text-white",
          ].join(" ")}
        >
          {club}
        </button>
      ))}
    </div>
  )
}
