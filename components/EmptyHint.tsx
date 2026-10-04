import Link from "next/link"

/**
 * An empty state that says what to do next and links there, e.g.
 * "Needs 2 rated rounds. Add round". `action` is the next step, `href` where it happens.
 */
export function EmptyHint({
  children,
  action,
  href,
  className = "text-sm text-fg-3",
}: {
  children: React.ReactNode
  action: string
  href: string
  className?: string
}) {
  return (
    <p className={className}>
      {children}{" "}
      <Link href={href} className="inline-flex min-h-[44px] items-center font-semibold text-accent hover:underline md:min-h-0">
        {action}
      </Link>
    </p>
  )
}
