"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/modal";
import type { getDictionary } from "@/i18n/dictionaries";

type Dictionary = ReturnType<typeof getDictionary>;

// Lifecycle mutation card on the V2 link detail: activate or deactivate behind
// an explicit confirmation dialog, posting the delivered action vocabulary with
// the prefilled version CAS to `/payment-links-v2/[id]`.
export function PaymentLinkV2LifecycleCard({
  active,
  dictionary,
  id,
  version,
}: Readonly<{
  active: boolean;
  dictionary: Dictionary;
  id: string;
  version: number;
}>) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const heading = active ? dictionary.paymentLinkDeactivateHeading : dictionary.paymentLinkActivateHeading;
  const description = active ? dictionary.paymentLinkDeactivateDescription : dictionary.paymentLinkActivateDescription;
  const confirmLabel = active ? dictionary.paymentLinkDeactivateConfirm : dictionary.paymentLinkActivateConfirm;
  const actionLabel = active ? dictionary.paymentLinkDeactivate : dictionary.paymentLinkActivate;
  const formId = `payment-link-v2-lifecycle-${id}`;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{heading}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">{description}</p>
          <form action={`/payment-links-v2/${id}`} id={formId} method="post">
            <input name="action" type="hidden" value={active ? "deactivate" : "activate"} />
            <input name="version" type="hidden" value={version} />
            <Button
              data-ds-hit-target
              onClick={() => setConfirmOpen(true)}
              type="button"
              variant={active ? "destructive" : "secondary"}
            >
              {actionLabel}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ConfirmDialog
        cancelLabel={dictionary.paymentLinkDirectoryBack}
        confirmLabel={actionLabel}
        destructive={active}
        description={description}
        failureMessage={dictionary.paymentLinkNoticeFailed}
        onConfirm={async () => {
          const form = document.getElementById(formId);
          if (form instanceof HTMLFormElement) form.requestSubmit();
        }}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        pendingLabel={dictionary.dataDirectoryLoading}
        title={confirmLabel}
      />
    </>
  );
}
