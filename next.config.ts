import type { NextConfig } from "next";
const origins = ["NEXT_PUBLIC_IDENTITY_API", "NEXT_PUBLIC_MUSIC_API", "NEXT_PUBLIC_USER_API"]
  .map(key => process.env[key])
  .filter(Boolean)
  .map(value => new URL(value!).origin);
const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  images: { unoptimized: true },
  async headers() {
    const connect = [
      "'self'",
      ...origins,
      "http://127.0.0.1:5101",
      "http://127.0.0.1:5102",
      "http://127.0.0.1:5103",
      "ws://127.0.0.1:*",
    ].join(" ");
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${origins.join(" ")} http://127.0.0.1:5102 http://127.0.0.1:5103; media-src 'self' blob: ${origins.join(" ")} http://127.0.0.1:5102; connect-src ${connect}; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`,
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default nextConfig;
