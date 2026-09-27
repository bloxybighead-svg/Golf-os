import type { Metadata, Viewport } from "next";
import NavBar from "@/components/NavBar";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golf OS",
  description: "Track your golf practice and plan your shots with your own dispersion",
  applicationName: "Golf OS",
  // Lets "Add to Home Screen" open it full-screen like an app.
  appleWebApp: { capable: true, title: "Golf OS", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // draw under the notch; content uses safe-area padding
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    data: { user },
  } = await createClient().auth.getUser();

  return (
    <html lang="en" className="dark">
      <body>
        <NavBar userEmail={user?.email ?? null} />
        <main className="mx-auto max-w-[1280px] px-4 pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pt-20 md:pb-16">
          {children}
        </main>
      </body>
    </html>
  );
}
