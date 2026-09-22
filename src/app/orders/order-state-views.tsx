import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { getDictionary } from "@/i18n/dictionaries";
import type { PaymentLinkOrderState } from "@/orders/order-v2-policies";

type Dictionary = ReturnType<typeof getDictionary>;

export function orderStateLabel(dictionary: Dictionary, state: PaymentLinkOrderState) {
  if (state === "CREATED") return dictionary.checkoutStateCreated;
  if (state === "PENDING") return dictionary.checkoutStatePending;
  if (state === "CONFIRMED") return dictionary.checkoutStateConfirmed;
  if (state === "REJECTED") return dictionary.checkoutStateRejected;
  if (state === "CANCELLED") return dictionary.checkoutStateCancelled;
  if (state === "EXPIRED") return dictionary.checkoutStateExpired;
  if (state === "REFUNDED") return dictionary.checkoutStateRefunded;
  return dictionary.checkoutStateIndeterminate;
}

function orderStateTone(state: PaymentLinkOrderState): StatusTone {
  if (state === "CONFIRMED") return "success";
  if (state === "REJECTED" || state === "CANCELLED" || state === "EXPIRED") return "danger";
  if (state === "PENDING" || state === "INDETERMINATE") return "info";
  return "neutral";
}

export function OrderStateBadge({ dictionary, state }: Readonly<{ dictionary: Dictionary; state: PaymentLinkOrderState }>) {
  return <StatusBadge label={orderStateLabel(dictionary, state)} tone={orderStateTone(state)} />;
}
