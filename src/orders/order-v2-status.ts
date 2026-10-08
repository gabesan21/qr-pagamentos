import "server-only";

import type { PaymentLinkOrderState } from "./order-v2-policies";
import type { OrderV2LocalOutcome } from "./order-v2";

export function resolveOrderV2StoreStatus(
  paymentState: PaymentLinkOrderState | null,
  currentLocalOutcome: OrderV2LocalOutcome | null,
): PaymentLinkOrderState | null {
  if (currentLocalOutcome === "LOCAL_CANCELLED") {
    return "CANCELLED";
  }
  return paymentState;
}
