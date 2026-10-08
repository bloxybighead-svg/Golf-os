import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { AccountCard } from "@/components/auth/AccountCard"
import { AppearanceSetting } from "@/components/you/AppearanceSetting"
import { PlannerSetting } from "@/components/you/PlannerSetting"
import { SyncSetting } from "@/components/you/SyncSetting"
import { SubPageHeader } from "@/components/you/SubPageHeader"

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="space-y-6 pt-4">
      <SubPageHeader title="Settings" />

      <AppearanceSetting />
      <PlannerSetting />
      <SyncSetting signedIn={!!user} />
      <AccountCard email={user?.email ?? null} />

      <Link
        href="/you/lab"
        className="group flex min-h-[56px] items-center justify-between rounded-xl border border-fg/[0.06] bg-surface px-5 py-3 transition-colors hover:bg-fg/[0.03]"
      >
        <span>
          <span className="block text-sm font-semibold text-fg">Lab</span>
          <span className="block text-xs text-muted">Compare, what if, which tees</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  )
}
