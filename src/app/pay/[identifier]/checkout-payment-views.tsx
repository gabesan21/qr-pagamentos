import type { ReactNode } from "react";
import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { QrDisplay } from "@/components/ui/qr-display";
import { ProviderStateBadge, type ProviderState } from "@/components/ui/status-badge";
import type { getDictionary } from "@/i18n/dictionaries";

type Dictionary = ReturnType<typeof getDictionary>;

// The closed client state vocabulary this view renders: the V1 order-state
// set plus the two V2 pre-order attempt states, which resolve to the same
// waiting treatment as "CREATED" (14.6.1 plan, decision 2 — one controller,
// two adapters over one shared vocabulary).
export type CheckoutPaymentViewState =
  | "CANCELLED"
  | "CONFIRMED"
  | "CREATED"
  | "CREATING"
  | "EXPIRED"
  | "INDETERMINATE"
  | "PENDING"
  | "REFUNDED"
  | "REJECTED"
  | "RESERVED";

const TERMINAL_STATES = new Set<CheckoutPaymentViewState>(["CANCELLED", "CONFIRMED", "EXPIRED", "REFUNDED", "REJECTED"]);
const FAILURE_STATES = new Set<CheckoutPaymentViewState>(["CANCELLED", "EXPIRED", "REJECTED"]);

function toProviderState(state: CheckoutPaymentViewState): ProviderState {
  if (state === "RESERVED" || state === "CREATING") return "created";
  if (state === "CREATED") return "created";
  if (state === "PENDING") return "pending";
  if (state === "INDETERMINATE") return "indeterminate";
  if (state === "CONFIRMED") return "confirmed";
  if (state === "REJECTED") return "rejected";
  if (state === "CANCELLED") return "cancelled";
  if (state === "EXPIRED") return "expired";
  return "refunded";
}

function providerLabels(dictionary: Dictionary): Readonly<Record<ProviderState, string>> {
  return {
    cancelled: dictionary.checkoutStateCancelled,
    confirmed: dictionary.checkoutStateConfirmed,
    created: dictionary.checkoutStateCreated,
    expired: dictionary.checkoutStateExpired,
    indeterminate: dictionary.checkoutStateIndeterminate,
    pending: dictionary.checkoutStatePending,
    refunded: dictionary.checkoutStateRefunded,
    rejected: dictionary.checkoutStateRejected,
  };
}

function terminalCopy(dictionary: Dictionary, state: "CANCELLED" | "CONFIRMED" | "EXPIRED" | "REFUNDED" | "REJECTED"): Readonly<{ body: string; title: string }> {
  const copy: Record<typeof state, Readonly<{ body: string; title: string }>> = {
    CANCELLED: { body: dictionary.checkoutOutcomeCancelledBody, title: dictionary.checkoutOutcomeCancelledTitle },
    CONFIRMED: { body: dictionary.checkoutOutcomeConfirmedBody, title: dictionary.checkoutOutcomeConfirmedTitle },
    EXPIRED: { body: dictionary.checkoutOutcomeExpiredBody, title: dictionary.checkoutOutcomeExpiredTitle },
    REFUNDED: { body: dictionary.checkoutOutcomeRefundedBody, title: dictionary.checkoutOutcomeRefundedTitle },
    REJECTED: { body: dictionary.checkoutOutcomeRejectedBody, title: dictionary.checkoutOutcomeRejectedTitle },
  };
  return copy[state];
}

export type CheckoutPaymentViewProps = Readonly<{
  currencyLabel?: string;
  dictionary: Dictionary;
  merchantIdentity?: ReactNode;
  merchantName: string;
  onRetryPoll: () => void;
  onStartOver: () => void;
  pixCopyPaste?: string;
  pixQrCodeUrl?: string;
  pollFailed?: boolean;
  state: CheckoutPaymentViewState;
  total: string;
}>;

/**
 * Presentational payment/outcome module (14.6.1 F02): the live view for the
 * waiting and open attempt states, and one distinct composition per terminal
 * state. No fetch, no timer, no locale logic — every label arrives through
 * `dictionary`, every reset goes back through `onStartOver`.
 */
export function CheckoutPaymentView(props: CheckoutPaymentViewProps): ReactNode {
  const { dictionary, onRetryPoll, onStartOver, pixCopyPaste, pollFailed, state } = props;
  const labels = providerLabels(dictionary);

  if (state === "CONFIRMED") {
    const copy = terminalCopy(dictionary, "CONFIRMED");
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 text-center">
        <CircleCheckIcon aria-hidden className="size-10 text-success" />
        <ProviderStateBadge labels={labels} state={toProviderState(state)} />
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">{copy.title}</h2>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted-foreground">{dictionary.checkoutAmountDueLabel}</span>
          <MoneyText className="ml-3" pairLabel={props.currencyLabel} size="large" value={props.total} />
        </div>
      </div>
    );
  }

  if (state === "REFUNDED") {
    const copy = terminalCopy(dictionary, "REFUNDED");
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 text-center">
        <ProviderStateBadge labels={labels} state={toProviderState(state)} />
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">{copy.title}</h2>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
      </div>
    );
  }

  if (FAILURE_STATES.has(state)) {
    const copy = terminalCopy(dictionary, state as "CANCELLED" | "EXPIRED" | "REJECTED");
    return (
      <div className="flex flex-col items-center gap-3">
        <ProviderStateBadge labels={labels} state={toProviderState(state)} />
        <EmptyState
          action={<Button onClick={onStartOver} type="button">{dictionary.checkoutStartOver}</Button>}
          body={copy.body}
          className="w-full"
          illustration="unavailable"
          kind="error"
          title={copy.title}
        />
      </div>
    );
  }

  // Live view: RESERVED, CREATING, CREATED, PENDING, INDETERMINATE.
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-6">
      <ProviderStateBadge labels={labels} state={toProviderState(state)} />
      {pollFailed ? (
        <Alert className="w-full" variant="warning">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>{dictionary.checkoutPollErrorBanner}</AlertTitle>
          <AlertDescription>
            <Button onClick={onRetryPoll} type="button" variant="outline">{dictionary.checkoutCheckAgain}</Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {state === "INDETERMINATE" ? <p className="text-center text-xs text-warning">{dictionary.checkoutConfirmingWithBank}</p> : null}
      <QrDisplay
        caption={pixCopyPaste ? dictionary.checkoutScanCaption : dictionary.checkoutGeneratingQr}
        graphicLabel={dictionary.checkoutQrAlt}
        identity={props.merchantIdentity}
        payload={pixCopyPaste}
        pending={!pixCopyPaste}
      />
      {pixCopyPaste ? (
        <CopyField
          labels={{ copy: dictionary.checkoutCopyPix, pending: dictionary.checkoutCopyPending, copied: dictionary.checkoutCopySuccess, failed: dictionary.checkoutCopyError }}
          value={pixCopyPaste}
          variant="compact"
        />
      ) : null}
      <div className="flex w-full items-baseline justify-between border-t border-border pt-4">
        <span className="text-sm text-muted-foreground">{dictionary.checkoutAmountDueLabel}</span>
        <MoneyText pairLabel={props.currencyLabel} size="large" value={props.total} />
      </div>
    </div>
  );
}

export { TERMINAL_STATES as CHECKOUT_PAYMENT_TERMINAL_STATES };
