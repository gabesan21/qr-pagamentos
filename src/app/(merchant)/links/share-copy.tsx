"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

// Read-only share affordance: it only observes the button click and reports
// the clipboard outcome politely; it never intercepts navigation or forms.
export function ShareLinkCopy({
  copiedLabel,
  copyLabel,
  failedLabel,
  value,
}: Readonly<{
  copiedLabel: string;
  copyLabel: string;
  failedLabel: string;
  value: string;
}>) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button
        data-ds-hit-target
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setState("copied");
          } catch {
            setState("failed");
          }
        }}
        type="button"
        variant="outline"
      >
        {state === "copied" ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
        {copyLabel}
      </Button>
      <span aria-live="polite" className="text-sm text-muted-foreground">
        {state === "copied" ? copiedLabel : state === "failed" ? failedLabel : ""}
      </span>
    </span>
  );
}
