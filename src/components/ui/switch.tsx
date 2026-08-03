"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex size-11 shrink-0 items-center rounded-full border border-transparent bg-transparent transition-all outline-none before:absolute before:left-1/2 before:top-1/2 before:h-5 before:w-8 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-input before:transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive data-checked:before:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none absolute left-2 block size-4 rounded-full bg-background ring-0 transition-transform group-data-checked/switch:translate-x-3 group-data-checked/switch:bg-primary-foreground"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
