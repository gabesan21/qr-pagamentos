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
  disableSubmit,
}: Readonly<{
  children: ReactNode;
  label: string;
  pendingLabel: string;
  /** Gates the submit button independently of the pending state, e.g. an
   *  identity form that stays disabled until a field is dirty. */
  disableSubmit?: boolean;
}>) {
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const fieldset = fieldsetRef.current;
    const form = fieldset?.closest("form");
    if (!fieldset || !form) return;
    // A sibling field component (see identity-fields.tsx / password-fields.tsx)
    // may run client-side validation on the same "submit" event and call
    // preventDefault() before this listener fires (child effects mount
    // before this parent one); skip the pending state entirely so the
    // button never gets stuck spinning on a submission that never left.
    const observeSubmit = (event: Event) => {
      if (pendingRef.current || event.defaultPrevented) return;
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
    <fieldset aria-busy={pending || undefined} className="contents" ref={fieldsetRef}>
      <CardContent>{children}</CardContent>
      <CardFooter>
        <Button disabled={pending || disableSubmit || undefined} type="submit">
          {pending ? <Spinner data-icon="inline-start" /> : null}
          <span aria-live="polite">{pending ? pendingLabel : label}</span>
        </Button>
      </CardFooter>
    </fieldset>
  );
}
