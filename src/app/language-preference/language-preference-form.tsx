"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type LanguagePreferenceSubmitProps = {
  label: string;
};

export function LanguagePreferenceSubmit({ label }: Readonly<LanguagePreferenceSubmitProps>) {
  const { pending } = useFormStatus();
  return <Button aria-busy={pending || undefined} disabled={pending} type="submit">{pending ? <Spinner data-icon="inline-start" /> : null}{label}</Button>;
}
