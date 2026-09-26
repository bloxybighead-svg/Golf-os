import SubNav from "./SubNav"

const ITEMS = [
  { label: "Course Planner", href: "/planner" },
  { label: "Dispersion", href: "/planner/dispersion" },
  { label: "Compare golfers", href: "/planner/compare" },
  { label: "Custom golfer", href: "/planner/custom" },
  { label: "Tee box", href: "/planner/tbox" },
]

export default function PlannerSubNav() {
  return <SubNav items={ITEMS} ariaLabel="Course planner sections" />
}
