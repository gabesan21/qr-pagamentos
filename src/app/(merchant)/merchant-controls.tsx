"use client";

import { cn } from "@/lib/utils";

// Shared merchant-local control, the app's counterpart of the template's own
// `pages/catalog/fields.tsx` shared module: owned here (not under
// `src/components/ui/`, whose frozen `owners` set has no insufficiency
// finding for this control) and imported by every merchant front that needs
// a small token-styled option toggle (catalog product state, settings
// layout).
export function SegmentedControl({
  ariaLabel,
  disabled,
  onChange,
  options,
  value,
}: Readonly<{
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  options: readonly Readonly<{ label: string; value: string }>[];
  value: string;
}>) {
  return (
    <div aria-label={ariaLabel} className="inline-flex gap-1 rounded-md bg-muted p-1" role="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            aria-checked={selected}
            className={cn(
              "rounded px-3 py-1.5 text-label font-medium transition-colors",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              disabled && "opacity-50",
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
    </div>
  );
}
