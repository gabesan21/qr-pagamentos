"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function NauttCredentialSubmit({ label, pendingLabel, variant = "default" }: Readonly<{ label: string; pendingLabel: string; variant?: "default" | "outline" }>) {
  const { pending } = useFormStatus();
  return <Button aria-busy={pending || undefined} data-ds-hit-target disabled={pending} type="submit" variant={variant}>
    {pending ? <Spinner data-icon="inline-start" /> : null}{pending ? pendingLabel : label}
  </Button>;
}
