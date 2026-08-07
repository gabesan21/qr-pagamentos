import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatCard } from "./stat-card";

describe("StatCard", () => {
  it("renders exact facts and a text-plus-icon trend without client animation", () => {
    const markup = renderToStaticMarkup(
      <StatCard caption="Compared with yesterday" label="Settled" trend={{ direction: "up", label: "12% up" }} value="R$ 82,10" />,
    );

    expect(markup).toContain("Settled");
    expect(markup).toContain("R$ 82,10");
    expect(markup).toContain("12% up");
    expect(markup).toContain("Compared with yesterday");
    expect(markup).toContain("lucide-arrow-up");
  });

  it("renders direct numeric values with the semantic mono/tabular role", () => {
    const markup = renderToStaticMarkup(<StatCard label="Settled" value={8210} />);

    expect(markup).toContain(">8210<");
    expect(markup).toContain("font-mono");
    expect(markup).toContain("tabular-nums");
  });
});
