import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & { size?: "sm" | "default" };

function NativeSelect({ className, size = "default", ...props }: NativeSelectProps) {
  return <div className={cn("relative w-full", className)} data-slot="native-select-wrapper" data-size={size}>
    <select data-slot="native-select" data-size={size} className="h-11 w-full appearance-none rounded-md border border-input bg-background py-2 pl-3 pr-10 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive" {...props} />
    <ChevronDownIcon aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" data-slot="native-select-icon" />
  </div>;
}

function NativeSelectOption(props: React.ComponentProps<"option">) { return <option data-slot="native-select-option" {...props} />; }
function NativeSelectOptGroup(props: React.ComponentProps<"optgroup">) { return <optgroup data-slot="native-select-optgroup" {...props} />; }

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
