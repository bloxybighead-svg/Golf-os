import SubNav, { type SubNavItem } from "./SubNav"

const ITEMS: SubNavItem[] = [
  { label: "Log", href: "/log", icon: "log" },
  { label: "Drills", href: "/drills", icon: "drills" },
  { label: "Trends", href: "/trends", icon: "trends" },
]

export default function PracticeSubNav() {
  return <SubNav items={ITEMS} ariaLabel="Practice sections" />
}
