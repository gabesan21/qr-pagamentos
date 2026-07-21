import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("next.config security headers", () => {
  it("serves the exact five-header set on every route", async () => {
    const entries = await nextConfig.headers?.();
    expect(entries).toEqual([
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
    ]);
  });
});
