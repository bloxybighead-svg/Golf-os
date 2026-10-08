import { Suspense } from "react"
import LoginForm from "@/components/auth/LoginForm"

// useSearchParams (to read ?next=) needs a Suspense boundary or Next
// tries to statically prerender this page and fails the build.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
