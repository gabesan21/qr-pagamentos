"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmationRequirement } from "@/components/ui/modal";

export type DestructiveActionFormProps = Readonly<{
  action: string;
  cancelLabel: string;
  confirmation?: ConfirmationRequirement;
  confirmLabel: string;
  dialogDescription: string;
  dialogTitle: string;
  failureMessage: string;
  pendingLabel: string;
  triggerLabel: string;
}>;

// The single client boundary shared by every destructive administrator
// action on this route family: it renders the real POST form, opens the
// existing ConfirmDialog on the trigger click, and submits that same form
// (never a detached ref) once the dialog confirms. Method, action, and every
// hidden input the caller renders stay exactly as delivered.
export function DestructiveActionForm({
  action,
  cancelLabel,
  confirmation,
  confirmLabel,
  dialogDescription,
  dialogTitle,
  failureMessage,
  pendingLabel,
  triggerLabel,
}: DestructiveActionFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <form action={action} className="contents" method="post" ref={formRef}>
        <Button data-ds-hit-target onClick={() => setOpen(true)} type="button" variant="destructive">
          {triggerLabel}
        </Button>
      </form>
      <ConfirmDialog
        cancelLabel={cancelLabel}
        confirmLabel={confirmLabel}
        confirmation={confirmation}
        description={dialogDescription}
        destructive
        failureMessage={failureMessage}
        onConfirm={() => formRef.current?.requestSubmit()}
        onOpenChange={setOpen}
        open={open}
        pendingLabel={pendingLabel}
        title={dialogTitle}
      />
    </>
  );
}
