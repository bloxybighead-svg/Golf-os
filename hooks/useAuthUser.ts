"use client"

// The browser Supabase client and the signed-in user, kept in step with sign-in
// and sign-out (moved verbatim from CourseMapClient.tsx).

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export type AuthUser = { id: string; email: string | null }

export function useAuthUser() {
  const supabaseRef = useRef<Awaited<ReturnType<typeof createClient>>>(undefined)
  if (!supabaseRef.current) supabaseRef.current = createClient()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)

  // Track sign-in state so hand-marked areas can be saved per account instead of
  // just to this browser.
  useEffect(() => {
    const supabase = supabaseRef.current!
    // The saved session answers at once and works with no signal, so an offline golfer is
    // still "signed in" (and can finish and queue a round). getUser then checks it with the
    // server; only a real refusal signs them out, never a dead connection.
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session?.user) setAuthUser({ id: data.session.user.id, email: data.session.user.email ?? null })
    })
    supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return
      if (data.user) setAuthUser({ id: data.user.id, email: data.user.email ?? null })
      else if (!error || error.status === 401 || error.status === 403 || error.name === "AuthSessionMissingError") setAuthUser(null)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return { supabase: supabaseRef.current, authUser }
}
