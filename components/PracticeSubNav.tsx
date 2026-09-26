import SubNav from "./SubNav"

const ITEMS = [
  { label: "Log", href: "/log" },
  { label: "Drills", href: "/drills" },
  { label: "Trends", href: "/trends" },
]

export default function PracticeSubNav() {
  return <SubNav items={ITEMS} ariaLabel="Practice sections" />
}
