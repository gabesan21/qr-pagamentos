import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  tone?: "primary" | "secondary";
};

/** @deprecated Migrate consumers to the owned shadcn Button in tasks 1.4.3/1.4.4. */
export function ActionButton({ children, loading = false, tone = "primary", disabled, ...props }: Readonly<ActionButtonProps>) {
  return <Button aria-busy={loading || undefined} disabled={disabled || loading} variant={tone === "primary" ? "default" : "outline"} {...props}>
    {loading ? <Spinner data-icon="inline-start" /> : null}
    {children}
  </Button>;
}
