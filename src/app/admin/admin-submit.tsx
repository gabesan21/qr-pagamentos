"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function AdminSubmit({ label, name, tone = "primary", value }: Readonly<{ label: string; name?: string; tone?: "primary" | "secondary"; value?: string }>) {
  const { pending } = useFormStatus();
  return (
    <Button aria-busy={pending || undefined} disabled={pending} name={name} type="submit" value={value} variant={tone === "secondary" ? "outline" : "default"}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {label}
    </Button>
  );
}
