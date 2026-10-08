import type { ReactNode } from "react";

import { ProviderStateBadge, StatusBadge, type ProviderState } from "@/components/ui/status-badge";
import type { getDictionary } from "@/i18n/dictionaries";
import type { OrderV2LocalOutcome, OrderV2Source, OrderV2State } from "@/orders/order-v2";

import { orderV2OutcomeLabel, orderV2OutcomeTone, orderV2SourceLabel, orderV2SourceTone, orderV2StateLabel } from "./order-v2-labels";

type Dictionary = ReturnType<typeof getDictionary>;

// Compact order badges (M-17.1): the visible pill text is shortened for dense
// surfaces while the full contextual label stays the accessible name. Both the
// list and the detail card consume this one module; tones come from the shared
// `status-badge` families and the neutral label/tone helpers.

function compactProviderStateLabels(dictionary: Dictionary): Readonly<Record<ProviderState, string>> {
  return {
    created: dictionary.orderV2DirectoryStateCreatedShort,
    pending: dictionary.orderV2DirectoryStatePendingShort,
    confirmed: dictionary.orderV2DirectoryStateConfirmedShort,
    rejected: dictionary.orderV2DirectoryStateRejectedShort,
    cancelled: dictionary.orderV2DirectoryStateCancelledShort,
    expired: dictionary.orderV2DirectoryStateExpiredShort,
    indeterminate: dictionary.orderV2DirectoryStateIndeterminateShort,
    refunded: dictionary.orderV2DirectoryStateRefundedShort,
  };
}

function compactSourceLabel(dictionary: Dictionary, source: OrderV2Source) {
  if (source === "LINK") return dictionary.orderV2DirectorySourceLinkShort;
  if (source === "STANDALONE") return dictionary.orderV2DirectorySourceStandaloneShort;
  return dictionary.orderV2DirectorySourceAdHocShort;
}

function CompactBadge({ accessibleLabel, children }: Readonly<{ accessibleLabel: string; children: ReactNode }>) {
  return (
    <span className="inline-flex whitespace-nowrap">
      <span aria-hidden>{children}</span>
      <span className="sr-only">{accessibleLabel}</span>
    </span>
  );
}

export function CompactOrderStatusBadge({ dictionary, state }: Readonly<{ dictionary: Dictionary; state: OrderV2State | null }>) {
  if (state === null) {
    return (
      <CompactBadge accessibleLabel={dictionary.orderV2DirectoryStateNone}>
        <StatusBadge label={dictionary.orderV2DirectoryStateNoneShort} tone="neutral" />
      </CompactBadge>
    );
  }
  const providerState = state.toLowerCase() as ProviderState;
  return (
    <CompactBadge accessibleLabel={orderV2StateLabel(dictionary, state)}>
      <ProviderStateBadge labels={compactProviderStateLabels(dictionary)} state={providerState} />
    </CompactBadge>
  );
}

export function CompactSourceBadge({ dictionary, source }: Readonly<{ dictionary: Dictionary; source: OrderV2Source }>) {
  return (
    <CompactBadge accessibleLabel={orderV2SourceLabel(dictionary, source)}>
      <StatusBadge label={compactSourceLabel(dictionary, source)} tone={orderV2SourceTone(source)} />
    </CompactBadge>
  );
}

export function CompactOutcomeBadge({ dictionary, outcome }: Readonly<{ dictionary: Dictionary; outcome: OrderV2LocalOutcome }>) {
  const label = outcome === "LOCAL_FINALIZED" ? dictionary.orderV2OutcomeFinalizedShort : dictionary.orderV2OutcomeCancelledShort;
  return (
    <CompactBadge accessibleLabel={orderV2OutcomeLabel(dictionary, outcome)}>
      <StatusBadge label={label} tone={orderV2OutcomeTone(outcome)} />
    </CompactBadge>
  );
}
