import Link from "next/link"

export function SignedOutNotice({ feature }: { feature: string }) {
  return (
    <div className="rounded-xl border border-accent/25 bg-accent/[0.06] px-5 py-4 text-sm">
      <p className="font-semibold text-fg">Sign in to see your {feature}</p>
      <p className="mt-1 text-xs text-fg-3">
        {feature} are saved per account now.{" "}
        <Link href="/login" className="text-accent underline underline-offset-2 hover:text-accent-hi">
          Sign in or create an account
        </Link>{" "}
        to view and log them.
      </p>
    </div>
  )
}
