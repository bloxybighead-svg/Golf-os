import { Suspense } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { DispersionSection } from "@/components/bag/DispersionSection"
import { CompareSection } from "@/components/bag/CompareSection"
import { CustomGolferSection } from "@/components/bag/CustomGolferSection"
import { TeeBoxSection } from "@/components/bag/TeeBoxSection"
import { ShotDataSection } from "@/components/bag/ShotDataSection"

const VIEWS = [
  { key: "shots", label: "Shot data" },
  { key: "dispersion", label: "Misses" },
  { key: "compare", label: "Compare" },
  { key: "custom", label: "What if" },
  { key: "tbox", label: "Tees" },
] as const

type View = (typeof VIEWS)[number]["key"]

// One tool at a time, picked by ?view=. Stacking all four would fetch every
// simulated shot for every golfer (tens of thousands of rows) on each visit.
export default function BagPage({ searchParams }: { searchParams?: { view?: string } }) {
  const view: View = VIEWS.find((v) => v.key === searchParams?.view)?.key ?? "dispersion"

  return (
    <div className="space-y-5 pt-4">
      <Link href="/you" className="flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg">
        <ArrowLeft size={14} />
        You
      </Link>

      <div role="group" aria-label="Bag tools" className="grid grid-cols-5 gap-1 rounded-xl border border-fg/[0.06] bg-surface p-1 md:inline-grid">
        {VIEWS.map(({ key, label }) => (
          <Link
            key={key}
            href={`/you/bag?view=${key}`}
            aria-current={key === view ? "page" : undefined}
            className={`rounded-lg px-2 py-2 text-center text-xs font-medium transition-colors md:px-4 ${
              key === view ? "bg-accent/15 text-accent" : "text-fg-3 hover:bg-fg/[0.05] hover:text-fg"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <Suspense key={view} fallback={<p className="py-10 text-center text-sm text-muted">Loading…</p>}>
        {view === "shots" && <ShotDataSection />}
        {view === "dispersion" && <DispersionSection />}
        {view === "compare" && <CompareSection />}
        {view === "custom" && <CustomGolferSection />}
        {view === "tbox" && <TeeBoxSection />}
      </Suspense>
    </div>
  )
}
