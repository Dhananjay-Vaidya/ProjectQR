import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AudioProvider } from "@/components/audio/AudioProvider";

/**
 * One family for the whole site: Bricolage Grotesque (variable). Geist Mono is
 * kept ONLY for the literal URL string shown in caption plates â€” nowhere else.
 */
const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LinkForge â€” paste a link, get a tiny world that scans",
  description:
    "Your URL becomes a miniature tree, city, or sculpture on a QR platform. Tap it to reveal the code; print it, share it, scan it.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bricolage.variable} ${geistMono.variable}`}>
        <AudioProvider>{children}</AudioProvider>
      </body>
    </html>
  );
}


