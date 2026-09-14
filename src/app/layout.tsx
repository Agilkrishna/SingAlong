import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DesiHangout — India's Hangout & Sing Along Rooms",
  description:
    "Anonymous hangout rooms for every Indian state — chat, voice & video with people from your state. Open a general hangout or a dedicated singing room with one-tap Sing Along (Antakshari) karaoke. No sign-up. Open source.",
  keywords: [
    "hangout",
    "chat rooms",
    "India",
    "DesiHangout",
    "Anthakshari",
    "singing rooms",
    "anonymous rooms",
    "video chat",
    "voice chat",
    "open source",
  ],
  authors: [{ name: "DesiHangout" }],
  openGraph: {
    title: "DesiHangout — Hang out with your entire State. Live.",
    description:
      "Anonymous hangout rooms for every Indian state — chat, voice & video, with one-tap Sing Along karaoke. Free and open source.",
    siteName: "DesiHangout",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#141414",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#141414] text-white`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
