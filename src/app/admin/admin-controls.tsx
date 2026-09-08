"use client";

import { cn } from "@/lib/utils";

// The admin family's own segmented control: the admin route group may not
// import the merchant `catalog-fields.tsx` twin (consolidation is a tracked
// follow-up), and the template keeps this control page-local too
// (`pages/admin/shared.tsx`). Radiogroup semantics, 44-pixel minimum hit
// targets and token classes only — no second button style. `name` is
// optional: pass it to also
// render a hidden input so the control participates in a native form POST
// without the caller wiring its own state-to-field bridge.
export type SegmentedControlOption<Value extends string = string> = Readonly<{
  value: Value;
  label: string;
}>;

export type SegmentedControlProps<Value extends string = string> = Readonly<{
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  name?: string;
  onChange: (value: Value) => void;
  options: readonly SegmentedControlOption<Value>[];
  value: Value;
}>;

export function SegmentedControl<Value extends string = string>({
  ariaLabel,
  className,
  disabled,
  name,
  onChange,
  options,
  value,
}: SegmentedControlProps<Value>) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn("inline-flex flex-wrap gap-1 rounded-md bg-muted p-1", className)}
      role="radiogroup"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            aria-checked={selected}
            className={cn(
              "min-h-11 min-w-11 rounded px-3 py-2 text-sm font-medium transition-colors",
              selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              disabled && "pointer-events-none opacity-50",
            )}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
            type="button"
          >
            {option.label}
          </button>
        );
      })}
      {name ? <input name={name} type="hidden" value={value} /> : null}
    </div>
  );
}
