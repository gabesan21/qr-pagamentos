"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

// Observation-only submit: listens to the associated native form's submit
// event to expose pending feedback, and never intercepts or replaces the
// native document POST. Without an explicit form id it observes its own
// ancestor form, which keeps duplicated responsive renderers working.
export function CatalogSubmit({
  disabled = false,
  form,
  label,
  tone = "primary",
}: Readonly<{
  disabled?: boolean;
  form?: string;
  label: string;
  tone?: "primary" | "secondary" | "destructive";
}>) {
  const [pending, setPending] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const nativeForm = form ? document.getElementById(form) : buttonRef.current?.form;
    if (!(nativeForm instanceof HTMLFormElement)) return;
    const observeNativeSubmit = () => setPending(true);
    nativeForm.addEventListener("submit", observeNativeSubmit);
    return () => nativeForm.removeEventListener("submit", observeNativeSubmit);
  }, [form]);

  return (
    <Button
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      form={form}
      ref={buttonRef}
      type="submit"
      variant={tone === "primary" ? "default" : tone === "secondary" ? "outline" : "destructive"}
    >
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {label}
    </Button>
  );
}
