import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & { size?: "sm" | "default" | "row" };

function NativeSelect({ className, size = "default", ...props }: NativeSelectProps) {
  return <div className={cn("relative w-full", className)} data-slot="native-select-wrapper" data-size={size}>
    <select data-slot="native-select" data-size={size} className="h-(--control-default-height) w-full appearance-none rounded-(--control-radius) border border-input bg-background py-(--control-padding-block) pl-(--control-padding-inline) pr-(--control-icon-padding-inline) text-(length:--control-field-text-size) text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive data-[size=row]:h-(--control-row-height)" {...props} />
    <ChevronDownIcon aria-hidden="true" className="pointer-events-none absolute right-(--control-padding-inline) top-1/2 size-4 -translate-y-1/2 text-muted-foreground" data-slot="native-select-icon" />
  </div>;
}

function NativeSelectOption(props: React.ComponentProps<"option">) { return <option data-slot="native-select-option" {...props} />; }
function NativeSelectOptGroup(props: React.ComponentProps<"optgroup">) { return <optgroup data-slot="native-select-optgroup" {...props} />; }

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
