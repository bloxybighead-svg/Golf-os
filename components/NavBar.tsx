"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Log", href: "/log" },
  { label: "Drills", href: "/drills" },
  { label: "Rounds", href: "/rounds" },
  { label: "Trends", href: "/trends" },
] as const;

export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-[#2a2a2a] bg-[#0f0f0f]/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-widest text-[#4ade80] uppercase">
            Golf OS
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ label, href }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={[
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-[#1e1e1e] text-white"
                    : "text-[#6b7280] hover:text-white hover:bg-[#161616]",
                ].join(" ")}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
