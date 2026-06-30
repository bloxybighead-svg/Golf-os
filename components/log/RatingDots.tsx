"use client"

interface Props {
  value: number | null
  onChange: (v: number) => void
}

export function RatingDots({ value, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={[
            "h-10 w-10 rounded-full border text-sm font-semibold transition-colors",
            value === n
              ? "border-[#4ade80] bg-[#4ade80] text-black"
              : "border-[#2a2a2a] text-[#6b7280] hover:border-white hover:text-white",
          ].join(" ")}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
