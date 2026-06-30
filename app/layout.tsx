import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golf OS",
  description: "Track your golf practice and performance",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <NavBar />
        <main className="mx-auto max-w-[1280px] px-6 pt-20 pb-16">
          {children}
        </main>
      </body>
    </html>
  );
}
