"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type LoginSubmitProps = {
  form: string;
  label: string;
  pendingLabel: string;
};

export function LoginSubmit({ form, label, pendingLabel }: Readonly<LoginSubmitProps>) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const loginForm = document.getElementById(form);
    if (!(loginForm instanceof HTMLFormElement)) return;

    const observeNativeSubmit = () => setPending(true);
    loginForm.addEventListener("submit", observeNativeSubmit);
    return () => loginForm.removeEventListener("submit", observeNativeSubmit);
  }, [form]);

  return <Button aria-busy={pending || undefined} className="w-full" disabled={pending} form={form} type="submit">
    {pending && <Spinner data-icon="inline-start" />}
    {pending ? pendingLabel : label}
  </Button>;
}
