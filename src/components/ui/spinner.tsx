import { LoaderCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return <LoaderCircleIcon aria-hidden="true" className={cn("animate-spin", className)} data-slot="spinner" {...props} />;
}

export { Spinner };
