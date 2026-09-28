import type { Metadata, Viewport } from "next";
import NavBar from "@/components/NavBar";
import { BRAND } from "@/lib/brand";
import { THEME_STORAGE_KEY } from "@/lib/theme/preference";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golf OS",
  description: "Track your golf practice and plan your shots with your own dispersion",
  applicationName: "Golf OS",
  // Lets "Add to Home Screen" open it full-screen like an app.
  appleWebApp: { capable: true, title: "Golf OS", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND.light },
    { media: "(prefers-color-scheme: dark)", color: BRAND.dark },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // draw under the notch; content uses safe-area padding
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-theme is set before first paint by the script below when the golfer
    // pinned Light or Dark on the You page; without it the CSS follows the system.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>
        <NavBar />
        <main className="mx-auto max-w-[1280px] px-4 pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pt-20 md:pb-16">
          {children}
        </main>
      </body>
    </html>
  );
}
