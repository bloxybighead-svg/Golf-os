import type { MetadataRoute } from "next"
import { BRAND } from "@/lib/brand"

// Makes the site installable ("Add to Home Screen") and full-screen on phones.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Golf OS",
    short_name: "Golf OS",
    description: "Track your golf practice and plan your shots with your own dispersion",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BRAND.dark,
    theme_color: BRAND.dark,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Course Planner", url: "/planner" },
      { name: "Log a session", url: "/log/new" },
    ],
  }
}
