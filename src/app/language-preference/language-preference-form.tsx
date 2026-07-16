"use client";

import { useFormStatus } from "react-dom";

import { ActionButton } from "../ui/action-button";

type LanguagePreferenceSubmitProps = {
  label: string;
};

export function LanguagePreferenceSubmit({ label }: Readonly<LanguagePreferenceSubmitProps>) {
  const { pending } = useFormStatus();
  return <ActionButton disabled={pending} loading={pending} type="submit">{label}</ActionButton>;
}
