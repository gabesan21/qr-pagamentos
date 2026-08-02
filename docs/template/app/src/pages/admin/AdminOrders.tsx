import { useMemo } from "react";
import { useNavigate } from "react-router";
import { ExternalLink } from "lucide-react";
import { useI18n } from "@/i18n";
import type { DictKey } from "@/i18n";
import { useToast } from "@/components/ui/Toast";
import { DataTable } from "@/components/ui/DataTable";
import type { Column } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import type { FilterChip } from "@/components/ui/FilterBar";
import { MoneyText } from "@/components/ui/MoneyText";
import { Monogram } from "@/components/ui/Monogram";
import { CopyField } from "@/components/ui/CopyField";
import { ProviderStateBadge, LocalOutcomeBadge } from "@/components/ui/StatusBadge";
import type { LocalOutcome, Order, OrderOrigin, ProviderState } from "@/mock/types";
import { mockFetch, orders, paymentLinks, users } from "@/mock/fixtures";
import { DateRangeFilter, FilterSelect, orderOrigin, useMockQuery, useUrlFilters } from "./shared";

const providerStates: ProviderState[] = ["created", "pending", "indeterminate", "confirmed", "rejected", "cancelled", "expired", "refunded"];
const outcomes: LocalOutcome[] = ["none", "in-progress", "finalized"];
const originList: OrderOrigin[] = ["LINK", "STANDALONE", "AD_HOC"];

const outcomeKey: Record<LocalOutcome, DictKey> = {
  none: "status.none",
  "in-progress": "status.inProgress",
  finalized: "status.finalized",
};

export default function AdminOrders() {
  const { t, formatDateTime } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { params, set, clearAll } = useUrlFilters(
    {
      source: originList,
      state: providerStates,
      outcome: outcomes,
      pair: ["BRL"],
    },
    () => toast("info", t("admin.invalidFiltersIgnored")),
  );

  const q = (params.get("q") ?? "").toLowerCase();
  const fSource = params.get("source") ?? "";
  const fState = params.get("state") ?? "";
  const fOutcome = params.get("outcome") ?? "";
  const fLink = params.get("link") ?? "";
  const fMerchant = params.get("merchant") ?? "";
  const fFrom = params.get("from") ?? "";
  const fTo = params.get("to") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = [10, 25, 50].includes(Number(params.get("size"))) ? Number(params.get("size")) : 10;

  const { data, loading, error, retry } = useMockQuery(() => mockFetch(orders, 500), []);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((o) => {
      if (fSource && orderOrigin(o) !== fSource) return false;
      if (fState && o.providerState !== fState) return false;
      if (fOutcome && o.localOutcome !== fOutcome) return false;
      if (fLink && (o.kind !== "v2" || !o.paymentLinkIdentifier.includes(fLink))) return false;
      if (fMerchant && !o.merchantUsername.toLowerCase().includes(fMerchant.toLowerCase())) return false;
      if (fFrom && o.createdAt < new Date(fFrom).toISOString()) return false;
      if (fTo && o.createdAt > new Date(`${fTo}T23:59:59`).toISOString()) return false;
      if (q) {
        const payer = o.kind === "v1" ? o.payer : o.customer;
        const hay = [o.id, o.merchantUsername, payer.name ?? "", payer.email ?? "", o.kind === "v2" ? o.paymentLinkIdentifier : ""].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, fSource, fState, fOutcome, fLink, fMerchant, fFrom, fTo, q]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const rows = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  const chips: FilterChip[] = [
    fSource && { key: "source", label: `${t("admin.filter.source")}: ${t(`admin.origin.${fSource}` as DictKey)}`, onRemove: () => set("source", null) },
    fState && { key: "state", label: `${t("admin.filter.providerState")}: ${t(`status.${fState}` as DictKey)}`, onRemove: () => set("state", null) },
    fOutcome && { key: "outcome", label: `${t("admin.filter.outcome")}: ${t(outcomeKey[fOutcome as LocalOutcome])}`, onRemove: () => set("outcome", null) },
    fLink && { key: "link", label: `${t("admin.filter.link")}: ${fLink}`, onRemove: () => set("link", null) },
    fMerchant && { key: "merchant", label: `${t("admin.filter.merchant")}: ${fMerchant}`, onRemove: () => set("merchant", null) },
    (fFrom || fTo) && { key: "date", label: `${fFrom || "…"} → ${fTo || "…"}`, onRemove: () => { set("from", null); set("to", null); } },
  ].filter(Boolean) as FilterChip[];

  const columns: Column<Order>[] = [
    {
      key: "merchant",
      header: t("admin.col.merchant"),
      render: (o) => {
        const u = users.find((x) => x.id === o.merchantId);
        const deleted = u?.state === "deleted" || o.merchantId === "u_old";
        return (
          <span className="flex items-center gap-2">
            <Monogram name={o.merchantUsername} size={24} />
            <span className={deleted ? "line-through" : ""}>{o.merchantUsername}</span>
            {deleted && <span className="rounded-pill bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger">{t("status.deleted")}</span>}
          </span>
        );
      },
    },
    {
      key: "payer",
      header: t("admin.col.payer"),
      render: (o) => {
        const p = o.kind === "v1" ? o.payer : o.customer;
        return <span className="text-text-2">{p.name ?? p.email ?? "—"}</span>;
      },
    },
    {
      key: "source",
      header: t("admin.col.source"),
      render: (o) => {
        const orig = orderOrigin(o);
        const cls = orig === "LINK" ? "bg-accent-soft text-text" : orig === "STANDALONE" ? "bg-info-soft text-info" : "bg-surface-2 text-text-2";
        return <span className={`rounded-pill px-2 py-0.5 text-xs font-medium ${cls}`}>{t(`admin.origin.${orig}` as DictKey)}</span>;
      },
    },
    {
      key: "link",
      header: t("admin.col.link"),
      render: (o) => (o.kind === "v2" ? <CopyField value={o.paymentLinkIdentifier} className="max-w-36" /> : <span className="text-text-3">—</span>),
    },
    { key: "state", header: t("admin.col.providerState"), render: (o) => <ProviderStateBadge state={o.providerState} /> },
    { key: "outcome", header: t("admin.col.outcome"), render: (o) => <span className="opacity-80"><LocalOutcomeBadge outcome={o.localOutcome} /></span> },
    {
      key: "amount",
      header: t("admin.col.amount"),
      className: "text-right",
      render: (o) => <MoneyText money={o.kind === "v1" ? o.amount : o.total} showPair className="justify-end" />,
    },
    { key: "created", header: t("admin.col.created"), render: (o) => <span className="text-xs text-text-2">{formatDateTime(o.createdAt)}</span> },
    {
      key: "actions",
      header: t("admin.col.actions"),
      render: (o) => (
        <button
          type="button"
          aria-label={t("common.open")}
          onClick={(e) => {
            e.stopPropagation();
            navigate(o.kind === "v2" ? `/admin/orders/v2/${o.id}` : `/admin/orders/${o.id}`);
          }}
          className="rounded-md p-1.5 text-text-3 hover:bg-surface-2 hover:text-accent"
        >
          <ExternalLink className="size-4" aria-hidden />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl leading-8 font-semibold tracking-[-0.02em] text-text">{t("admin.ordersTitle")}</h1>
        <p className="mt-1 text-sm text-text-2">{t("admin.ordersCaption")}</p>
      </div>

      <FilterBar searchPlaceholder={t("admin.searchOrders")} chips={chips} onClearAll={clearAll}>
        <FilterSelect label={t("admin.filter.source")} value={fSource} onChange={(v) => set("source", v || null)} allLabel={t("admin.filter.source")} options={originList.map((o) => ({ value: o, label: t(`admin.origin.${o}` as DictKey) }))} />
        <FilterSelect label={t("admin.filter.pair")} value={params.get("pair") ?? ""} onChange={(v) => set("pair", v || null)} allLabel={t("admin.filter.pair")} options={[{ value: "BRL", label: "BRL / PIX" }]} />
        <FilterSelect label={t("admin.filter.providerState")} value={fState} onChange={(v) => set("state", v || null)} allLabel={t("admin.filter.providerState")} options={providerStates.map((s) => ({ value: s, label: t(`status.${s}` as DictKey) }))} />
        <FilterSelect label={t("admin.filter.outcome")} value={fOutcome} onChange={(v) => set("outcome", v || null)} allLabel={t("admin.filter.outcome")} options={outcomes.map((o) => ({ value: o, label: t(outcomeKey[o]) }))} />
        <FilterSelect label={t("admin.filter.link")} value={fLink} onChange={(v) => set("link", v || null)} allLabel={t("admin.filter.link")} options={paymentLinks.map((l) => ({ value: l.identifier, label: l.identifier }))} />
        <FilterSelect label={t("admin.filter.merchant")} value={fMerchant} onChange={(v) => set("merchant", v || null)} allLabel={t("admin.filter.merchant")} options={users.filter((u) => u.role === "USER").map((u) => ({ value: u.username, label: u.username }))} />
        <DateRangeFilter from={fFrom} to={fTo} onFrom={(v) => set("from", v || null)} onTo={(v) => set("to", v || null)} />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(o) => o.id}
        loading={loading}
        error={error}
        onRetry={retry}
        emptyVariant={chips.length > 0 || q ? "filtered" : "empty"}
        emptyIllustration="orders"
        onClearFilters={clearAll}
        onRowClick={(o) => navigate(o.kind === "v2" ? `/admin/orders/v2/${o.id}` : `/admin/orders/${o.id}`)}
        page={clampedPage}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => set("page", String(p))}
        onPageSizeChange={(s) => set("size", String(s))}
      />
    </div>
  );
}
