import { createClient } from "@/lib/supabase/server"
import { AccountCard } from "@/components/auth/AccountCard"
import { AppearanceSetting } from "@/components/you/AppearanceSetting"
import { PlannerSetting } from "@/components/you/PlannerSetting"
import { SyncSetting } from "@/components/you/SyncSetting"
import { SubPageHeader } from "@/components/you/SubPageHeader"
import { loadSpreadSuggestion } from "@/lib/supabase/loadSpreadSuggestion"

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const spreadSuggestion = user ? await loadSpreadSuggestion(supabase) : null

  return (
    <div className="space-y-6 pt-4">
      <SubPageHeader title="Settings" />

      <AppearanceSetting />
      <PlannerSetting spreadSuggestion={spreadSuggestion} />
      <SyncSetting signedIn={!!user} />
      <AccountCard email={user?.email ?? null} />
    </div>
  )
}
