"use client";

import { useState } from "react";

import type { PaymentLinkV2DerivedState } from "@/auth/payment-link-v2-view";
import type { PaymentLinkType } from "@/auth/payment-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/modal";
import type { getDictionary } from "@/i18n/dictionaries";

type Dictionary = ReturnType<typeof getDictionary>;

// Lifecycle mutation card on the V2 link detail: activate or deactivate behind
// an explicit confirmation dialog, posting the delivered action vocabulary with
// the prefilled version CAS to `/payment-links-v2/[id]`.
//
// Derived-model guards (decision 5, 14.5.2): deactivate is offered whenever
// the link is persisted-active (`active`, `expired`, `paid`); activate is
// offered only for `inactive`, and a settled `SINGLE_USE` link (its own
// `paid` fact, independent from the derived `state`) renders it disabled
// with the settled caption instead of a control. An `expired` `REUSABLE`
// link additionally surfaces a caption that reopening requires editing the
// expiry; nothing renders for an `expired` `SINGLE_USE` link beyond the
// still-offered deactivate control.
export function PaymentLinkV2LifecycleCard({
  dictionary,
  id,
  linkType,
  paid,
  state,
  version,
}: Readonly<{
  dictionary: Dictionary;
  id: string;
  linkType: PaymentLinkType;
  paid: boolean;
  state: PaymentLinkV2DerivedState;
  version: number;
}>) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canDeactivate = state !== "inactive";
  const settledSingleUse = state === "inactive" && linkType === "SINGLE_USE" && paid;
  const canActivate = state === "inactive" && !settledSingleUse;
  const expiredReopenCaption = state === "expired" && linkType === "REUSABLE";

  if (!canDeactivate && !canActivate && !settledSingleUse) return null;

  const active = canDeactivate;
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
          {settledSingleUse ? (
            <>
              <Button data-ds-hit-target disabled type="button" variant="secondary">
                {dictionary.paymentLinkActivate}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">{dictionary.paymentLinkActivateDisabledSettled}</p>
            </>
          ) : (
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
          )}
          {expiredReopenCaption ? (
            <p className="mt-2 text-xs text-muted-foreground">{dictionary.paymentLinkExpiredReopenCaption}</p>
          ) : null}
        </CardContent>
      </Card>

      {!settledSingleUse ? (
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
      ) : null}
    </>
  );
}
