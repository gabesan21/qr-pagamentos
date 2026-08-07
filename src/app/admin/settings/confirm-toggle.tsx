"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";

import type { Dictionary } from "./settings-surface";

export function ConfirmToggleButton({
  confirmBody,
  confirmTitle,
  dictionary,
  kind,
  label,
}: Readonly<{
  confirmBody?: string;
  confirmTitle: string;
  dictionary: Dictionary;
  kind: "destructive" | "default";
  label: string;
}>) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmed) {
      const form = buttonRef.current?.form;
      if (form) form.requestSubmit();
    }
  }, [confirmed]);

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant={kind === "destructive" ? "outline" : "default"}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => setConfirmed(true)}
        title={confirmTitle}
        description={confirmBody ?? ""}
        confirmLabel={label}
        cancelLabel={dictionary.cancel}
        pendingLabel={dictionary.loading}
        failureMessage={dictionary.adminChangeFailed}
        destructive={kind === "destructive"}
      />
    </>
  );
}
