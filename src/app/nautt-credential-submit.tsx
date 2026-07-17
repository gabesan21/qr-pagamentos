"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function NauttCredentialSubmit({ form, label, pendingLabel, variant = "default" }: Readonly<{ form: string; label: string; pendingLabel: string; variant?: "default" | "outline" }>) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const nativeForm = document.getElementById(form);
    if (!(nativeForm instanceof HTMLFormElement)) return;
    const observeNativeSubmit = () => setPending(true);
    nativeForm.addEventListener("submit", observeNativeSubmit);
    return () => nativeForm.removeEventListener("submit", observeNativeSubmit);
  }, [form]);

  return <Button aria-busy={pending || undefined} data-ds-hit-target data-nautt-action-control disabled={pending} form={form} type="submit" variant={variant}>
    {pending ? <Spinner data-icon="inline-start" /> : null}{pending ? pendingLabel : label}
  </Button>;
}
