import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-(--control-radius) border border-transparent px-(--control-padding-inline) text-(length:--control-button-text-size) font-medium whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        outline: "border-border bg-background text-foreground hover:bg-muted active:bg-accent-soft",
        secondary: "bg-secondary text-secondary-foreground hover:bg-muted active:bg-accent-soft",
        ghost: "text-foreground hover:bg-muted active:bg-accent-soft",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        "quiet-destructive": "text-danger-on-soft hover:bg-muted active:bg-muted",
        link: "px-(--control-inline-padding) text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-(--control-default-height)",
        sm: "min-h-(--control-default-height) px-(--control-padding-inline)",
        row: "min-h-(--control-row-height) px-(--control-padding-inline)",
        inline: "min-h-(--control-default-height) px-(--control-inline-padding)",
        lg: "min-h-(--control-large-height) px-(--control-padding-inline)",
        icon: "size-(--control-default-height) px-(--control-inline-padding)",
        "icon-row": "size-(--control-row-height) px-(--control-inline-padding)",
        "theme-swatch": "h-auto w-full flex-col rounded-(--control-selection-tile-radius) p-(--control-selection-tile-padding) data-[size=theme-swatch]:items-start data-[size=theme-swatch]:justify-start data-[size=theme-swatch]:gap-0 data-[size=theme-swatch]:whitespace-normal data-[size=theme-swatch]:text-(length:--control-selection-tile-text-size)",
        segmented: "min-h-(--control-default-height) rounded-(--control-segmented-radius) px-(--control-segmented-padding-inline) font-semibold uppercase data-[size=segmented]:text-(length:--control-segmented-text-size)",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({ className, variant = "default", size = "default", asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" data-variant={variant} data-size={size} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
