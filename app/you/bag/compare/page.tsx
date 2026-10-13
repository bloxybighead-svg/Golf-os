import { CompareSection } from "@/components/bag/CompareSection"
import { SubPageHeader } from "@/components/you/SubPageHeader"

export default function ComparePage() {
  return (
    <div className="space-y-5 pt-4">
      <SubPageHeader title="Compare with a handicap" back={{ href: "/you/bag", label: "My bag" }} />
      <CompareSection />
    </div>
  )
}
