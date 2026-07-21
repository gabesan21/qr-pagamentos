import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Minimal static security-header set on every response. CSP is deliberately
  // absent: the App Router injects inline hydration scripts, a strict script-src
  // needs per-request nonces (middleware, forbidden by the epoch decision), and
  // unsafe-inline would be security theater.
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ],
};

export default nextConfig;
