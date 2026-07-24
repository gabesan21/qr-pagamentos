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
    const observeSubmit = (event: SubmitEvent) => {
      if (pendingRef.current) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      const payload = new FormData(form);
      pendingRef.current = true;
      flushSync(() => { setPending(true); });
      fieldset.disabled = true;
      void fetch(form.action, {
        body: payload,
        method: "POST",
      }).then((response) => {
        if (response.redirected) {
          window.location.assign(response.url);
          return;
        }
        window.location.reload();
      }).catch(() => {
        pendingRef.current = false;
        fieldset.disabled = false;
        setPending(false);
      });
    };
    form.addEventListener("submit", observeSubmit);
    return () => {
      form.removeEventListener("submit", observeSubmit);
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
