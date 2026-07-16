"use client";

import { useFormStatus } from "react-dom";

import { ActionButton } from "@/app/ui/action-button";

export function AdminSubmit({ label, tone = "primary" }: Readonly<{ label: string; tone?: "primary" | "secondary" }>) {
  const { pending } = useFormStatus();
  return <ActionButton disabled={pending} loading={pending} tone={tone} type="submit">{label}</ActionButton>;
}
