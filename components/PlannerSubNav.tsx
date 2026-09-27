import SubNav, { type SubNavItem } from "./SubNav"

const ITEMS: SubNavItem[] = [
  { label: "Course Planner", href: "/planner", icon: "map" },
  { label: "Dispersion", href: "/planner/dispersion", icon: "activity" },
  { label: "Compare golfers", href: "/planner/compare", icon: "compare" },
  { label: "Custom golfer", href: "/planner/custom", icon: "sliders" },
  { label: "Tee box", href: "/planner/tbox", icon: "flag" },
]

export default function PlannerSubNav() {
  return <SubNav items={ITEMS} ariaLabel="Course planner sections" />
}
