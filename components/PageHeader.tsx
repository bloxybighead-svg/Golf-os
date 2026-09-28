import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

// Consistent page title block: icon tile, title, one-line description, optional right-hand actions.
export default function PageHeader({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon
  title: string
  subtitle?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-fg md:text-2xl">{title}</h1>
          {subtitle && <div className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted md:text-sm">{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}
