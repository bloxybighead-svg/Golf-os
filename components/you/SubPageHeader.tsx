import Link from "next/link"
import { ArrowLeft } from "lucide-react"

/** Back link to the hub plus the page title, shared by every You sub-page. */
export function SubPageHeader({ title, back = { href: "/you", label: "You" } }: { title: string; back?: { href: string; label: string } }) {
  return (
    <div className="space-y-3">
      <Link href={back.href} className="flex min-h-[44px] w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg">
        <ArrowLeft size={14} />
        {back.label}
      </Link>
      <h2 className="text-2xl font-bold tracking-tight text-fg">{title}</h2>
    </div>
  )
}
