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

  it("renders an aria-hidden sparkline path from the given data", () => {
    const markup = renderToStaticMarkup(<StatCard label="Settled" sparkline={[1, 5, 2, 8, 3]} value="R$ 82,10" />);

    expect(markup).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(markup).toContain("<polyline");
    expect(markup).toMatch(/points="0,\d/);
  });

  it("omits the sparkline for zero or one data point", () => {
    expect(renderToStaticMarkup(<StatCard label="Settled" sparkline={[]} value="R$ 82,10" />)).not.toContain("<polyline");
    expect(renderToStaticMarkup(<StatCard label="Settled" sparkline={[4]} value="R$ 82,10" />)).not.toContain("<polyline");
  });

  it("flattens a constant series to the sparkline's vertical midline instead of dividing by zero", () => {
    const markup = renderToStaticMarkup(<StatCard label="Settled" sparkline={[5, 5, 5]} value="R$ 82,10" />);
    expect(markup).toContain("<polyline");
    expect(markup).not.toContain("NaN");
  });
});
