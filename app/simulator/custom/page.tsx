import { CustomGolferClient } from "@/components/simulator/CustomGolferClient"

// No Supabase fetch here on purpose: generation runs entirely client-side
// (lib/golfer), so the page has nothing to do server-side. Nothing is
// persisted -- this is an exploratory "what if" tool, not a saved profile.
export default function CustomGolferPage() {
  return <CustomGolferClient />
}
