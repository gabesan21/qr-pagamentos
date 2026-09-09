"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type RecoveryCodesProps = Readonly<{
  codes: readonly string[];
  copiedLabel: string;
  copyLabel: string;
  downloadLabel: string;
  savedLabel: string;
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
  title: string;
  description: string;
}>;

export function RecoveryCodes({
  codes,
  copiedLabel,
  copyLabel,
  downloadLabel,
  savedLabel,
  saved,
  onSavedChange,
  title,
  description,
}: RecoveryCodesProps) {
  const [copied, setCopied] = useState(false);
  const listId = useId();

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // ignore
    }
  }

  function download() {
    const blob = new Blob([codes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = "recovery-codes.txt";
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ul aria-label={title} className="grid grid-cols-2 gap-2 font-mono text-sm" id={listId}>
        {codes.map((code) => (
          <li className="rounded-md border bg-muted px-2.5 py-1.5 text-center" key={code}>
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void copy()} type="button" variant="secondary">
          {copied ? copiedLabel : copyLabel}
        </Button>
        <Button onClick={download} type="button" variant="secondary">
          {downloadLabel}
        </Button>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          checked={saved}
          id={`${listId}-saved`}
          onCheckedChange={(checked) => onSavedChange(checked === true)}
        />
        <Label className="text-sm font-normal" htmlFor={`${listId}-saved`}>
          {savedLabel}
        </Label>
      </div>
    </div>
  );
}
