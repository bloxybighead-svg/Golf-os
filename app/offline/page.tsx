// Shown when a page is opened with no signal and this phone has never saved it.
// Dynamic (not static) so middleware can stamp this page's inline scripts with a CSP nonce; the service worker saves the response, nonce and CSP header included.
export const dynamic = "force-dynamic"

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md space-y-3 pt-8">
      <h1 className="text-xl font-semibold text-fg">No signal</h1>
      <p className="text-sm text-fg-2">This page isn&apos;t saved on your phone yet. Play, with your round and course, still works once it has been opened with signal.</p>
      {/* A plain link on purpose: a full page load is what the service worker answers when signal returns. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="inline-flex h-11 items-center rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent">
        Open Play
      </a>
    </div>
  )
}
