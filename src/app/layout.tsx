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
  title: "SingAlong — Anonymous Anthakshari Rooms",
  description:
    "Join anonymous video & voice Anthakshari rooms based on your Indian state. No sign-up — pick a stage, sing, and chain songs live. Open source.",
  keywords: [
    "Anthakshari",
    "singing game",
    "anonymous rooms",
    "video chat",
    "voice chat",
    "India",
    "open source",
  ],
  authors: [{ name: "SingAlong" }],
  openGraph: {
    title: "SingAlong — Anthakshari with your entire State. Live.",
    description:
      "Anonymous video + voice singing rooms for every Indian state. Free and open source.",
    siteName: "SingAlong",
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
