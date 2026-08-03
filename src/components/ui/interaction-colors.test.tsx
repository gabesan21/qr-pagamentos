import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge, badgeVariants } from "./badge";
import { Button, buttonVariants } from "./button";

const root = process.cwd();

describe("shared action interaction colors", () => {
  it("uses the explicit semantic primary state classes without opacity blending", () => {
    expect(buttonVariants({ variant: "default" })).toContain("bg-primary");
    expect(buttonVariants({ variant: "default" })).toContain("hover:bg-primary-hover");
    expect(buttonVariants({ variant: "default" })).toContain("active:bg-primary-active");
    expect(buttonVariants({ variant: "default" })).not.toMatch(/(?:hover|active):bg-primary\//u);

    expect(badgeVariants({ variant: "default" })).toContain("bg-primary");
    expect(badgeVariants({ variant: "default" })).toContain("[a]:hover:bg-primary-hover");
    expect(badgeVariants({ variant: "default" })).toContain("[a]:active:bg-primary-active");
    expect(badgeVariants({ variant: "default" })).not.toMatch(/\[a\]:(?:hover|active):bg-primary\//u);
  });

  it("keeps the public Button and Badge markup semantic", () => {
    expect(renderToStaticMarkup(<Button>Continue</Button>)).toContain("text-primary-foreground");
    const badge = renderToStaticMarkup(<Badge asChild><a href="#paid">Paid</a></Badge>);
    expect(badge).toContain("hover:bg-primary-hover");
    expect(badge).toContain("active:bg-primary-active");
  });

  it("does not introduce raw colors or theme branches in the shared consumers", () => {
    for (const file of ["button.tsx", "badge.tsx"]) {
      const source = readFileSync(join(root, "src/components/ui", file), "utf8");
      expect(source).not.toMatch(/#[0-9a-f]{3,8}|data-theme|dark:/iu);
    }
  });
});
