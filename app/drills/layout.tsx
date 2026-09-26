import PracticeSubNav from "@/components/PracticeSubNav"

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PracticeSubNav />
      {children}
    </>
  )
}
