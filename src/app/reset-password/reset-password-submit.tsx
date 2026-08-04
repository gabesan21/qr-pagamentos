"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type ResetPasswordSubmitProps = {
  label: string;
  pendingLabel: string;
};

export function ResetPasswordSubmit({ label, pendingLabel }: Readonly<ResetPasswordSubmitProps>) {
  const { pending: formPending } = useFormStatus();
  const [nativePending, setNativePending] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const form = buttonRef.current?.form;
    if (!form) return;

    const observeNativeSubmit = () => setNativePending(true);
    form.addEventListener("submit", observeNativeSubmit);
    return () => form.removeEventListener("submit", observeNativeSubmit);
  }, []);

  const pending = formPending || nativePending;

  return (
    <Button ref={buttonRef} aria-busy={pending || undefined} className="w-full" disabled={pending} type="submit">
      {pending && <Spinner data-icon="inline-start" />}
      {pending ? pendingLabel : label}
    </Button>
  );
}
