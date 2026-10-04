import { ShotDataSection } from "@/components/bag/ShotDataSection"
import { SubPageHeader } from "@/components/you/SubPageHeader"

export default function ShotsPage() {
  return (
    <div className="space-y-5 pt-4">
      <SubPageHeader title="My shot data" back={{ href: "/you/bag", label: "My bag" }} />
      <ShotDataSection />
    </div>
  )
}
