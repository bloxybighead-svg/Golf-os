import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { buildCsp } from "@/lib/security/csp"

// Refreshes the Supabase auth session cookie on every request. Without this,
// a session nearing expiry can go stale in the browser because nothing else
// touches it between page loads (server components only READ cookies, they
// can't write a refreshed one back).
export async function middleware(request: NextRequest) {
  // Fresh nonce per request. Next reads it from the request's CSP header and stamps it on its inline scripts.
  const nonce = btoa(crypto.randomUUID())
  const csp = buildCsp(nonce, process.env.NEXT_PUBLIC_SUPABASE_URL)
  const CSP_HEADER = "Content-Security-Policy-Report-Only" // rename to "Content-Security-Policy" to enforce
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(CSP_HEADER, csp)

  let response = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: requestHeaders } })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options as any))
        },
      },
    }
  )

  // Also refills the response cookie if the access token was refreshed.
  await supabase.auth.getUser()

  response.headers.set(CSP_HEADER, csp)
  return response
}

export const config = {
  // Skip static assets and the PWA icon/manifest/service-worker files; everything else runs through.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|icon.svg|apple-icon.png|manifest.webmanifest|sw.js|swe-worker).*)"],
}
