import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { AudioProvider } from "@/lib/audio";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ConditionalAppLayout from "@/components/layout/ConditionalAppLayout";

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  fallback: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Arial", "sans-serif"],
  preload: true,
});

const geistMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", "monospace"],
  preload: true,
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
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/logo.svg',
    apple: '/logo.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ErrorBoundary>
          <AudioProvider>
            <ConditionalAppLayout>
              {children}
            </ConditionalAppLayout>
          </AudioProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
} 