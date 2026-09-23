import type { ComponentType, SVGProps } from "react";
import { ArchiveIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type StatusTone = "danger" | "info" | "neutral" | "success" | "warning";
type StatusIcon = ComponentType<SVGProps<SVGSVGElement>>;

const toneClasses: Readonly<Record<StatusTone, string>> = {
  danger: "bg-danger-soft text-danger-on-soft",
  info: "bg-info-soft text-info-on-soft",
  neutral: "bg-surface-2 text-text-2",
  success: "bg-success-soft text-success-on-soft",
  warning: "bg-warning-soft text-warning-on-soft",
};

type StatusPillProps = Readonly<{
  archived?: boolean;
  className?: string;
  icon?: StatusIcon;
  label: string;
  tone?: StatusTone;
}>;

/**
 * Single internal renderer shared by `StatusBadge` and every domain family
 * below (docs/template/app/src/components/ui/StatusBadge.tsx): soft-tint
 * pill, a `bg-current` dot marker by default, `ArchiveIcon` when archived,
 * struck-through label when archived or explicitly requested. Color never
 * carries meaning alone.
 */
function StatusPill({ archived = false, className, icon: Icon, label, tone = "neutral" }: StatusPillProps) {
  const marker = archived ? (
    <ArchiveIcon aria-hidden className="size-3" />
  ) : Icon ? (
    <Icon aria-hidden className="size-3" />
  ) : (
    <span aria-hidden className="size-1.5 rounded-full bg-current" />
  );
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-medium", toneClasses[tone], className)}>
      {marker}
      <span className={cn(archived && "line-through")}>{label}</span>
    </span>
  );
}

type StatusBadgeProps = Readonly<{
  archived?: boolean;
  className?: string;
  icon?: StatusIcon;
  label: string;
  tone?: StatusTone;
}>;

export function StatusBadge({ archived = false, className, icon, label, tone = "neutral" }: StatusBadgeProps) {
  return <StatusPill archived={archived} className={className} icon={icon} label={label} tone={tone} />;
}

/**
 * Shared tone-by-state-name lookup for the five domain families below,
 * mirroring the template's mapping: state names that carry the same meaning
 * across domains ("active", "confirmed", "finalized" all mean the happy
 * terminal state) resolve to the same tone. Each family still declares its
 * own closed state union below — never a domain enum imported from
 * src/orders, src/auth etc. — and callers supply localized `labels`.
 */
type DomainStateName =
  | "active"
  | "archived"
  | "cancelled"
  | "confirmed"
  | "created"
  | "deleted"
  | "disabled"
  | "expired"
  | "finalized"
  | "inactive"
  | "indeterminate"
  | "in-progress"
  | "none"
  | "paid"
  | "pending"
  | "refunded"
  | "rejected";

const domainToneByState: Readonly<Record<DomainStateName, StatusTone>> = {
  active: "success",
  archived: "neutral",
  cancelled: "danger",
  confirmed: "success",
  created: "info",
  deleted: "danger",
  disabled: "warning",
  expired: "danger",
  finalized: "success",
  inactive: "neutral",
  indeterminate: "warning",
  "in-progress": "info",
  none: "neutral",
  paid: "info",
  pending: "info",
  refunded: "neutral",
  rejected: "danger",
};

function domainTone<State extends DomainStateName>(state: State): StatusTone {
  return domainToneByState[state];
}

export type ProviderState =
  | "cancelled"
  | "confirmed"
  | "created"
  | "expired"
  | "indeterminate"
  | "pending"
  | "refunded"
  | "rejected";

export function ProviderStateBadge({
  labels,
  state,
}: Readonly<{ labels: Readonly<Record<ProviderState, string>>; state: ProviderState }>) {
  return <StatusPill label={labels[state]} tone={domainTone(state)} />;
}

export type LocalOutcome = "finalized" | "in-progress" | "none";

export function LocalOutcomeBadge({
  labels,
  outcome,
}: Readonly<{ labels: Readonly<Record<LocalOutcome, string>>; outcome: LocalOutcome }>) {
  return <StatusPill label={labels[outcome]} tone={domainTone(outcome)} />;
}

export type LinkLifecycle = "active" | "expired" | "inactive" | "paid";

export function LinkLifecycleBadge({
  labels,
  lifecycle,
}: Readonly<{ labels: Readonly<Record<LinkLifecycle, string>>; lifecycle: LinkLifecycle }>) {
  return <StatusPill label={labels[lifecycle]} tone={domainTone(lifecycle)} />;
}

export type AccountState = "active" | "deleted" | "disabled";

export function AccountStateBadge({
  labels,
  state,
  username,
}: Readonly<{ labels: Readonly<Record<AccountState, string>>; state: AccountState; username?: string }>) {
  const badge = <StatusPill label={labels[state]} tone={domainTone(state)} />;
  if (state !== "deleted" || !username) return badge;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-text-3 line-through">{username}</span>
      {badge}
    </span>
  );
}

export type EntityState = "active" | "archived" | "inactive";

export function EntityStateBadge({
  labels,
  state,
}: Readonly<{ labels: Readonly<Record<EntityState, string>>; state: EntityState }>) {
  return <StatusPill archived={state === "archived"} label={labels[state]} tone={domainTone(state)} />;
}
