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
        <main className="mx-auto max-w-4xl px-4 pt-20 pb-12">
          {children}
        </main>
      </body>
    </html>
  );
}
