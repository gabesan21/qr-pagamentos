"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export function ProfileFormBody({
  children,
  label,
  pendingLabel,
}: Readonly<{
  children: ReactNode;
  label: string;
  pendingLabel: string;
}>) {
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const fieldset = fieldsetRef.current;
    const form = fieldset?.closest("form");
    if (!fieldset || !form) return;
    const observeSubmit = () => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      flushSync(() => { setPending(true); });
    };
    const observePayload = () => { fieldset.disabled = true; };
    form.addEventListener("submit", observeSubmit);
    form.addEventListener("formdata", observePayload);
    return () => {
      form.removeEventListener("submit", observeSubmit);
      form.removeEventListener("formdata", observePayload);
    };
  }, []);

  return (
    <fieldset aria-busy={pending || undefined} className="profile-form__fieldset" ref={fieldsetRef}>
      <CardContent>{children}</CardContent>
      <CardFooter>
        <Button type="submit">
          {pending ? <Spinner data-icon="inline-start" /> : null}
          <span aria-live="polite">{pending ? pendingLabel : label}</span>
        </Button>
      </CardFooter>
    </fieldset>
  );
}
