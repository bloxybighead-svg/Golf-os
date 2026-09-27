import Link from "next/link"

export function SignedOutNotice({ feature }: { feature: string }) {
  return (
    <div className="rounded-xl border border-[#22c55e]/25 bg-[#22c55e]/[0.06] px-5 py-4 text-sm">
      <p className="font-semibold text-white">Sign in to see your {feature}</p>
      <p className="mt-1 text-xs text-[#9ca3af]">
        {feature} are saved per account now.{" "}
        <Link href="/login" className="text-[#22c55e] underline underline-offset-2 hover:text-[#4ade80]">
          Sign in or create an account
        </Link>{" "}
        to view and log them.
      </p>
    </div>
  )
}
