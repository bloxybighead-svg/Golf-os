"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Flag, Loader2, LogIn, UserPlus } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type Mode = "signin" | "signup"

export default function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const redirectTo = params.get("redirect") || "/"

  const [mode, setMode] = useState<Mode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [checkEmail, setCheckEmail] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError("")
    setBusy(true)
    const supabase = createClient()
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.replace(redirectTo)
        router.refresh()
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // If email confirmation is on, signUp returns no session yet.
        if (!data.session) {
          setCheckEmail(true)
        } else {
          router.replace(redirectTo)
          router.refresh()
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-6 pt-10">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-on-accent">
          <Flag size={16} strokeWidth={2.6} />
        </span>
        <span className="text-base font-bold tracking-tight text-fg">
          Golf <span className="text-accent">OS</span>
        </span>
      </Link>

      <div className="w-full rounded-2xl border border-fg/[0.07] bg-surface p-5">
        <div className="mb-4 flex rounded-lg border border-fg/[0.08] bg-page p-1 text-sm">
          {(["signin", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setError("")
                setCheckEmail(false)
              }}
              className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                mode === m ? "bg-accent text-on-accent" : "text-fg-3 hover:text-fg"
              }`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        {checkEmail ? (
          <p className="rounded-lg border border-accent/25 bg-accent/[0.07] p-3 text-sm text-fg-2">
            Check <span className="font-semibold text-fg">{email}</span> for a confirmation link, then come back and
            sign in.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-fg/[0.08] bg-page px-3 py-2 text-sm text-fg focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">Password</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border border-fg/[0.08] bg-page px-3 py-2 text-sm text-fg focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>
            {error && <p className="text-xs text-danger">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-all hover:brightness-110 disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : mode === "signin" ? <LogIn size={15} /> : <UserPlus size={15} />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        )}
      </div>

      <p className="max-w-xs text-center text-xs text-muted">
        An account lets your hand-marked course areas (trees, water, out of bounds) follow you between devices. Log,
        Drills, Rounds and Trends don&rsquo;t need an account yet.
      </p>
    </div>
  )
}
