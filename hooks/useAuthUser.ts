"use client"

// The browser Supabase client and the signed-in user, kept in step with sign-in
// and sign-out (moved verbatim from CourseMapClient.tsx).

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export type AuthUser = { id: string; email: string | null }

export function useAuthUser() {
  const supabaseRef = useRef<ReturnType<typeof createClient>>()
  if (!supabaseRef.current) supabaseRef.current = createClient()
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)

  // Track sign-in state so hand-marked areas can be saved per account instead of
  // just to this browser.
  useEffect(() => {
    const supabase = supabaseRef.current!
    supabase.auth.getUser().then(({ data }) => {
      setAuthUser(data.user ? { id: data.user.id, email: data.user.email ?? null } : null)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null)
    })
    return () => subscription.unsubscribe()
  }, [])

  return { supabase: supabaseRef.current, authUser }
}
