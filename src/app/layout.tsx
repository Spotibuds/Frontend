import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Spotibuds",
    template: "%s | Spotibuds",
  },
  description: "Connect with friends through music. Discover, share, and enjoy music together.",
  keywords: ["music", "social", "streaming", "friends", "discovery"],
  authors: [{ name: "Spotibuds Team" }],
  creator: "Spotibuds",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://spotibuds.com",
    title: "Spotibuds",
    description: "Connect with friends through music",
    siteName: "Spotibuds",
  },
  twitter: {
    card: "summary_large_image",
    title: "Spotibuds",
    description: "Connect with friends through music",
    creator: "@spotibuds",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900`}
      >
        <div className="relative min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
} 