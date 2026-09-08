import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it.each(["danger", "info", "neutral", "success", "warning"] as const)("renders %s with text and a non-color dot marker", (tone) => {
    const markup = renderToStaticMarkup(<StatusBadge label={`${tone} status`} tone={tone} />);
    expect(markup).toContain(`${tone} status`);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("bg-current");
  });

  it("uses an archive icon and strike-through in the archived state", () => {
    const markup = renderToStaticMarkup(<StatusBadge archived label="Archived" />);
    expect(markup).toContain("lucide-archive");
    expect(markup).toContain("line-through");
  });
});
