import { readFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button, buttonVariants } from "./button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "./empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "./pagination";

const primitiveNames = [
  "alert",
  "alert-dialog",
  "avatar",
  "badge",
  "button",
  "card",
  "checkbox",
  "dialog",
  "empty",
  "field",
  "input",
  "input-otp",
  "label",
  "native-select",
  "pagination",
  "separator",
  "skeleton",
  "sonner",
  "spinner",
  "switch",
  "table",
  "tabs",
  "textarea",
] as const;

const sharedInventory = JSON.parse(
  readFileSync(new URL("./inventory.json", import.meta.url), "utf8"),
) as { owners: Array<{ owner: string }>; localAdditions?: Array<{ owner: string }> };

const compositionNames = sharedInventory.owners
  .map(({ owner }) => owner.match(/^src\/components\/ui\/(.+)\.tsx$/u)?.[1])
  .filter((name): name is string => Boolean(name) && !primitiveNames.includes(name as (typeof primitiveNames)[number]));

const localAdditionNames = (sharedInventory.localAdditions ?? [])
  .map(({ owner }) => owner.match(/^src\/components\/ui\/(.+)\.tsx$/u)?.[1])
  .filter((name): name is string => Boolean(name));

function source(name: (typeof primitiveNames)[number]) {
  return readFileSync(new URL(`./${name}.tsx`, import.meta.url), "utf8");
}

describe("shared primitive inventory", () => {
  it("distinguishes the approved primitive and composition source inventories", () => {
    const actual = readdirSync(new URL(".", import.meta.url))
      .filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"))
      .map((name) => name.replace(/\.tsx$/u, ""))
      .sort();

    expect(actual).toEqual([...new Set([...primitiveNames, ...compositionNames, ...localAdditionNames])].sort());
    expect(compositionNames).toHaveLength(13);
  });

  it("keeps client boundaries limited to primitives that require browser state", () => {
    const clientPrimitives = new Set([
      "alert-dialog",
      "avatar",
      "checkbox",
      "dialog",
      "input-otp",
      "label",
      "separator",
      "sonner",
      "switch",
      "tabs",
    ]);

    for (const name of primitiveNames) {
      expect(source(name).startsWith('"use client"'), name).toBe(clientPrimitives.has(name));
    }
  });

  it("uses only semantic theme projections and tokenized overlay depth", () => {
    for (const name of primitiveNames) {
      const contents = source(name);
      expect(contents, name).not.toMatch(/\bdark:/u);
      expect(contents, name).not.toMatch(/\bz-\d+\b/u);
      expect(contents, name).not.toMatch(/next-themes/u);
    }

    for (const name of ["dialog", "alert-dialog"] as const) {
      expect(source(name)).toContain("z-(--layer-bypass)");
      expect(source(name)).toContain("shadow-[var(--shadow-modal)]");
      expect(source(name)).toContain("duration-(--motion-duration)");
    }
  });

  it("preserves the existing button API while enforcing target and focus contracts", () => {
    expect(buttonVariants({ variant: "default", size: "default" })).toContain("min-h-11");
    expect(buttonVariants({ variant: "outline", size: "icon" })).toContain("size-11");
    expect(buttonVariants({ variant: "link", size: "sm" })).toContain("focus-visible:ring-3");

    const markup = renderToStaticMarkup(<Button disabled>Continue</Button>);
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain('data-variant="default"');
    expect(markup).toContain('data-size="default"');
    expect(markup).toContain("disabled");
  });

  it("keeps every value-bearing control at the minimum target with visible focus", () => {
    for (const name of ["checkbox", "input-otp", "switch", "tabs"] as const) {
      const contents = source(name);
      expect(contents, name).toMatch(/(?:size-11|min-h-11)/u);
      expect(contents, name).toContain("ring-3");
      expect(contents, name).toMatch(/disabled|data-disabled/u);
    }
    expect(source("input-otp")).toContain("aria-invalid");
    expect(source("switch")).toContain("data-checked:before:bg-primary");
    expect(source("tabs")).toContain("data-active:text-foreground");
  });

  it("delegates overlay focus behavior to Radix and requires labelled close controls", () => {
    const dialog = source("dialog");
    const confirmation = source("alert-dialog");

    expect(dialog).toContain("DialogPrimitive.Portal");
    expect(dialog).toContain("DialogPrimitive.Title");
    expect(dialog).toContain("closeLabel");
    expect(confirmation).toContain("AlertDialogPrimitive.Action");
    expect(confirmation).toContain("AlertDialogPrimitive.Cancel");
    expect(confirmation).toContain("AlertDialogPrimitive.Title");
  });

  it("renders semantic empty and localized cursor-navigation structures", () => {
    const emptyMarkup = renderToStaticMarkup(
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Nothing here</EmptyTitle>
          <EmptyDescription>Try another filter.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>Recovery action</EmptyContent>
      </Empty>,
    );
    expect(emptyMarkup).toContain("<p");
    expect(emptyMarkup).toContain('data-slot="empty-description"');

    const paginationMarkup = renderToStaticMarkup(
      <Pagination label="Results pages">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="?cursor=previous" label="Previous results" text="Previous" />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="?cursor=next" label="Next results" text="Next" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );
    expect(paginationMarkup).toContain('aria-label="Results pages"');
    expect(paginationMarkup).toContain('aria-label="Previous results"');
    expect(paginationMarkup).toContain('aria-label="Next results"');
    expect(paginationMarkup).not.toMatch(/total|page=\d/u);
  });

  it("keeps toast feedback semantic and icon imports aligned with Lucide", () => {
    const toaster = source("sonner");
    expect(toaster).toContain('from "lucide-react"');
    expect(toaster).toContain("bg-popover");
    expect(toaster).toContain("text-popover-foreground");
    expect(toaster).toContain("actionButton: \"min-h-11");
    expect(toaster).toContain("focus-visible:ring-3");
  });
});
