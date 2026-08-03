import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Timeline } from "./timeline";

describe("Timeline", () => {
  it("renders ordered, already formatted events with non-color tone markers", () => {
    const markup = renderToStaticMarkup(
      <Timeline entries={[
        { dateTime: "2026-08-03T12:00:00Z", formattedAt: "03 Aug 2026, 12:00", id: "created", title: "Created" },
        { body: "Provider accepted the payment.", formattedAt: "03 Aug 2026, 12:05", id: "paid", title: "Paid", tone: "success" },
      ]} />,
    );

    expect(markup).toContain("<ol");
    expect(markup.match(/<li/gu)).toHaveLength(2);
    expect(markup).toContain('dateTime="2026-08-03T12:00:00Z"');
    expect(markup).toContain("Provider accepted the payment.");
    expect(markup).toContain("lucide-check");
  });

  it("keeps every F02 owner server-safe and free of business or formatting dependencies", () => {
    const owners = [
      "empty-state",
      "money-text",
      "monogram",
      "qr-display",
      "skeletons",
      "stat-card",
      "status-badge",
      "timeline",
    ];

    for (const owner of owners) {
      const source = readFileSync(new URL(`./${owner}.tsx`, import.meta.url), "utf8");
      expect(source.startsWith('"use client"'), owner).toBe(false);
      expect(source, owner).not.toMatch(/@\/i18n|@\/mock|@\/auth|@\/orders|@\/checkout|qrcode|framer-motion/u);
      expect(source, owner).not.toMatch(/\bdark:|#[\da-f]{3,8}\b/u);
    }
  });
});
