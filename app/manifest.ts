import type { MetadataRoute } from "next"
import { APP_NAME, BRAND } from "@/lib/brand"

// Makes the site installable ("Add to Home Screen") and full-screen on phones.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
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
      { name: "Play", url: "/" },
      { name: "Log a session", url: "/log/new" },
    ],
  }
}
