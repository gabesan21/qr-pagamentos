"use client";

import { useEffect, useRef } from "react";

export function NauttPendingScope({ children }: Readonly<{ children: React.ReactNode }>) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    let pending = false;

    const actionControls = () => scope.querySelectorAll<HTMLInputElement | HTMLButtonElement>("[data-nautt-action-control]");
    const disableAllControls = () => actionControls().forEach((control) => { control.disabled = true; });
    const forms = Array.from(scope.querySelectorAll("form"));
    const observeFormData = () => disableAllControls();
    const observeSubmit = (event: SubmitEvent) => {
      if (pending) {
        event.preventDefault();
        return;
      }
      pending = true;
      actionControls().forEach((control) => {
        if (control instanceof HTMLButtonElement) control.disabled = true;
      });
    };

    scope.addEventListener("submit", observeSubmit);
    forms.forEach((form) => form.addEventListener("formdata", observeFormData));
    return () => {
      scope.removeEventListener("submit", observeSubmit);
      forms.forEach((form) => form.removeEventListener("formdata", observeFormData));
    };
  }, []);

  return <div className="contents" ref={scopeRef}>{children}</div>;
}
