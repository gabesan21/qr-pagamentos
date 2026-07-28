"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type ResetPasswordSubmitProps = {
  form: string;
  label: string;
  pendingLabel: string;
};

export function ResetPasswordSubmit({ form, label, pendingLabel }: Readonly<ResetPasswordSubmitProps>) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const resetForm = document.getElementById(form);
    if (!(resetForm instanceof HTMLFormElement)) return;

    const observeNativeSubmit = () => setPending(true);
    resetForm.addEventListener("submit", observeNativeSubmit);
    return () => resetForm.removeEventListener("submit", observeNativeSubmit);
  }, [form]);

  return <Button aria-busy={pending || undefined} className="w-full" disabled={pending} form={form} type="submit">
    {pending && <Spinner data-icon="inline-start" />}
    {pending ? pendingLabel : label}
  </Button>;
}
