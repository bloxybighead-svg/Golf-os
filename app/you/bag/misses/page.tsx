import { DispersionSection } from "@/components/bag/DispersionSection"
import { SubPageHeader } from "@/components/you/SubPageHeader"

export default function MissesPage() {
  return (
    <div className="space-y-5 pt-4">
      <SubPageHeader title="Your misses" back={{ href: "/you/bag", label: "My bag" }} />
      <DispersionSection />
    </div>
  )
}
