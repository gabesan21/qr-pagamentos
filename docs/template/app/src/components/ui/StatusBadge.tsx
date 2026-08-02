import { Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { DictKey } from "@/i18n";
import type { LocalOutcome, ProviderState } from "@/mock/types";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClasses: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-2 text-text-2",
};

function Badge({ tone, label, strikethrough, archived }: { tone: Tone; label: string; strikethrough?: boolean; archived?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        archived && "text-text-3",
      )}
    >
      {archived ? <Archive className="size-3" aria-hidden /> : <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      <span className={cn(strikethrough && "line-through")}>{label}</span>
    </span>
  );
}

const providerMap: Record<ProviderState, { tone: Tone; key: DictKey }> = {
  created: { tone: "info", key: "status.created" },
  pending: { tone: "info", key: "status.pending" },
  indeterminate: { tone: "warning", key: "status.indeterminate" },
  confirmed: { tone: "success", key: "status.confirmed" },
  rejected: { tone: "danger", key: "status.rejected" },
  cancelled: { tone: "danger", key: "status.cancelled" },
  expired: { tone: "danger", key: "status.expired" },
  refunded: { tone: "neutral", key: "status.refunded" },
};

const outcomeMap: Record<LocalOutcome, { tone: Tone; key: DictKey }> = {
  finalized: { tone: "success", key: "status.finalized" },
  "in-progress": { tone: "info", key: "status.inProgress" },
  none: { tone: "neutral", key: "status.none" },
};

export function ProviderStateBadge({ state }: { state: ProviderState }) {
  const { t } = useI18n();
  const m = providerMap[state];
  return <Badge tone={m.tone} label={t(m.key)} />;
}

export function LocalOutcomeBadge({ outcome }: { outcome: LocalOutcome }) {
  const { t } = useI18n();
  const m = outcomeMap[outcome];
  return <Badge tone={m.tone} label={t(m.key)} />;
}

export type LinkLifecycle = "active" | "paid" | "expired" | "inactive";

export function LinkLifecycleBadge({ lifecycle }: { lifecycle: LinkLifecycle }) {
  const { t } = useI18n();
  const map: Record<LinkLifecycle, { tone: Tone; key: DictKey }> = {
    active: { tone: "success", key: "status.active" },
    paid: { tone: "info", key: "status.paid" },
    expired: { tone: "danger", key: "status.expired" },
    inactive: { tone: "neutral", key: "status.inactive" },
  };
  const m = map[lifecycle];
  return <Badge tone={m.tone} label={t(m.key)} />;
}

export function AccountStateBadge({ state, username }: { state: "active" | "disabled" | "deleted"; username?: string }) {
  const { t } = useI18n();
  const map = {
    active: { tone: "success" as Tone, key: "status.active" as DictKey },
    disabled: { tone: "warning" as Tone, key: "status.disabled" as DictKey },
    deleted: { tone: "danger" as Tone, key: "status.deleted" as DictKey },
  };
  const m = map[state];
  if (state === "deleted" && username) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="line-through text-text-3">{username}</span>
        <Badge tone={m.tone} label={t(m.key)} />
      </span>
    );
  }
  return <Badge tone={m.tone} label={t(m.key)} />;
}

export function EntityStateBadge({ state }: { state: "active" | "inactive" | "archived" }) {
  const { t } = useI18n();
  const map = {
    active: { tone: "success" as Tone, key: "status.active" as DictKey },
    inactive: { tone: "neutral" as Tone, key: "status.inactive" as DictKey },
    archived: { tone: "neutral" as Tone, key: "status.archived" as DictKey },
  };
  const m = map[state];
  return <Badge tone={m.tone} label={t(m.key)} archived={state === "archived"} />;
}
