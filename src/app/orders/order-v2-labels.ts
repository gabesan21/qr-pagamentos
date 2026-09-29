import type { getDictionary } from "@/i18n/dictionaries";
import type { OrderV2LocalOutcome, OrderV2Source, OrderV2State } from "@/orders/order-v2";

import { orderStateLabel } from "./order-state-views";

type Dictionary = ReturnType<typeof getDictionary>;

// Role-neutral label/tone helpers shared by the full and compact order badges
// and the detail chronology. Extracted from `order-v2-views` (M-17.1) so the
// compact badge module can reuse them without importing the view module.

export function orderV2StateLabel(dictionary: Dictionary, state: OrderV2State | null) {
  return state === null ? dictionary.orderV2DirectoryStateNone : orderStateLabel(dictionary, state);
}

export function orderV2StateTone(state: OrderV2State | null): "danger" | "info" | "neutral" | "success" {
  if (state === "CONFIRMED") return "success";
  if (state === "REJECTED") return "danger";
  if (state === "PENDING") return "info";
  return "neutral";
}

export function orderV2OutcomeLabel(dictionary: Dictionary, outcome: OrderV2LocalOutcome) {
  return outcome === "LOCAL_FINALIZED" ? dictionary.orderV2DirectoryOutcomeFinalized : dictionary.orderV2DirectoryOutcomeCancelled;
}

export function orderV2OutcomeTone(outcome: OrderV2LocalOutcome): "danger" | "info" | "neutral" | "success" {
  if (outcome === "LOCAL_FINALIZED") return "success";
  if (outcome === "LOCAL_CANCELLED") return "danger";
  return "neutral";
}

export function orderV2SourceLabel(dictionary: Dictionary, source: OrderV2Source) {
  if (source === "LINK") return dictionary.orderV2DirectorySourceLink;
  if (source === "STANDALONE") return dictionary.orderV2DirectorySourceStandalone;
  return dictionary.orderV2DirectorySourceAdHoc;
}

export function orderV2SourceTone(source: OrderV2Source): "info" | "neutral" | "success" {
  if (source === "LINK") return "success";
  if (source === "AD_HOC") return "info";
  return "neutral";
}
