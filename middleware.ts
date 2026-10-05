import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Refreshes the Supabase auth session cookie on every request. Without this,
// a session nearing expiry can go stale in the browser because nothing else
// touches it between page loads (server components only READ cookies, they
// can't write a refreshed one back).
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

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
          response = NextResponse.next({ request: { headers: request.headers } })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options as any))
        },
      },
    }
  )

  // Also refills the response cookie if the access token was refreshed.
  await supabase.auth.getUser()

  return response
}

export const config = {
  // Skip static assets and the PWA icon/manifest/service-worker files; everything else runs through.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|icon.svg|apple-icon.png|manifest.webmanifest|sw.js|swe-worker).*)"],
}
