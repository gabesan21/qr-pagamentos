"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type LoginSubmitProps = {
  form: string;
  label: string;
  pendingLabel: string;
};

export function LoginSubmit({ form, label, pendingLabel }: Readonly<LoginSubmitProps>) {
  const { pending } = useFormStatus();

  return <Button aria-busy={pending || undefined} className="w-full" disabled={pending} form={form} type="submit">
    {pending && <Spinner data-icon="inline-start" />}
    {pending ? pendingLabel : label}
  </Button>;
}
