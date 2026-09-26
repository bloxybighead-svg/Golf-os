import PlannerSubNav from "@/components/PlannerSubNav"

export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PlannerSubNav />
      {children}
    </>
  )
}
