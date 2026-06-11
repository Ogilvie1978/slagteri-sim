import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slagteri Simulator",
  description: "Byg Danmarks største slagteri",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da">
      <body className="bg-stone-950 text-stone-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
