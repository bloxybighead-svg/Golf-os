import Link from "next/link"
import { ChevronRight } from "lucide-react"

/** One row on the You hub: a noun, the most useful number beside it, and a chevron. */
export function HubRow({ href, label, value }: { href: string; label: string; value?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex min-h-[56px] items-center gap-3 px-5 py-3 transition-colors hover:bg-fg/[0.03]"
    >
      <span className="min-w-0 flex-1 text-base font-semibold text-fg">{label}</span>
      {value != null && value !== "" && <span className="shrink-0 text-sm text-fg-3 tabular-nums">{value}</span>}
      <ChevronRight size={16} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
