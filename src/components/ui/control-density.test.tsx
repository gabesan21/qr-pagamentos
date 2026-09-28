import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button, buttonVariants } from "./button";
import { Input } from "./input";
import { NativeSelect, NativeSelectOption } from "./native-select";
import { Textarea } from "./textarea";

describe("shared control density contract", () => {
  it("routes desktop/mobile geometry and field type through generated control variables", () => {
    const markup = renderToStaticMarkup(
      <>
        <Input aria-label="Name" />
        <NativeSelect aria-label="State"><NativeSelectOption value="active">Active</NativeSelectOption></NativeSelect>
        <Textarea aria-label="Notes" />
      </>,
    );
    expect(markup).toContain("h-(--control-default-height)");
    expect(markup).toContain("text-(length:--control-field-text-size)");
    expect(markup).toContain("rounded-(--control-radius)");
    expect(markup).toContain("min-h-(--control-textarea-min-height)");
  });

  it("keeps an explicit compact row action and a quiet destructive trigger", () => {
    const markup = renderToStaticMarkup(<Button size="row" variant="quiet-destructive">Delete</Button>);
    expect(markup).toContain('data-size="row"');
    expect(markup).toContain('data-variant="quiet-destructive"');
    expect(buttonVariants({ size: "row" })).toContain("min-h-(--control-row-height)");
    expect(buttonVariants({ variant: "quiet-destructive" })).toContain("text-danger-on-soft");
  });

  it("keeps selection tile and segmented geometry inside shared Button roles", () => {
    expect(buttonVariants({ size: "theme-swatch" })).toContain("p-(--control-selection-tile-padding)");
    expect(buttonVariants({ size: "theme-swatch" })).toContain("rounded-(--control-selection-tile-radius)");
    expect(buttonVariants({ size: "segmented" })).toContain("min-h-(--control-default-height)");
    expect(buttonVariants({ size: "segmented" })).toContain("px-(--control-segmented-padding-inline)");
  });
});
