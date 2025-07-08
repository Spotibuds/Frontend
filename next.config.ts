import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Allow production builds to complete even if there are TypeScript errors
    ignoreBuildErrors: false,
  },
  eslint: {
    // Allow production builds to complete even if there are ESLint errors
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  // Fix cross-origin warnings - specify allowed origins for dev server
  allowedDevOrigins: [
    "26.179.76.180",
    "localhost",
    "127.0.0.1",
  ],
  // Improve font loading and network resilience
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "unsafe-none",
          },
          {
            key: "Cross-Origin-Opener-Policy", 
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
};

export default nextConfig; 