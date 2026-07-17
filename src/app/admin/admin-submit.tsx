"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function AdminSubmit({ label, tone = "primary" }: Readonly<{ label: string; tone?: "primary" | "secondary" }>) {
  const { pending } = useFormStatus();
  return (
    <Button aria-busy={pending || undefined} disabled={pending} type="submit" variant={tone === "secondary" ? "outline" : "default"}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {label}
    </Button>
  );
}
