import { LoaderCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return <LoaderCircleIcon aria-label="Loading" className={cn("animate-spin", className)} data-slot="spinner" role="status" {...props} />;
}

export { Spinner };
