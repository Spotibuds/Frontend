import type { Metadata } from "next";
import "./globals.css";
import { AudioProvider } from "@/lib/audio";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NotificationProvider } from "@/contexts/NotificationContext";
import ConditionalAppLayout from "@/components/layout/ConditionalAppLayout";
import { FavoritesProvider } from "@/contexts/FavoritesContext";

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
    index: false,
    follow: false,
  },
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <ErrorBoundary>
          <AudioProvider>
            <NotificationProvider>
              <FavoritesProvider>
                <ConditionalAppLayout>{children}</ConditionalAppLayout>
              </FavoritesProvider>
            </NotificationProvider>
          </AudioProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
