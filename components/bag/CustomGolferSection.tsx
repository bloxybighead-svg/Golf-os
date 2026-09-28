import { CustomGolferClient } from "@/components/simulator/CustomGolferClient"

// No Supabase fetch here on purpose: generation runs entirely client-side
// (lib/golfer), so the section has nothing to do server-side. Nothing is
// persisted -- this is an exploratory "what if" tool, not a saved profile.
export function CustomGolferSection() {
  return <CustomGolferClient />
}
