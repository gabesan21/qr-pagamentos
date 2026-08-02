import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useI18n } from "@/i18n";
import type { DictKey } from "@/i18n";
import { useSession } from "@/mock/session";
import { useToast } from "@/components/ui/Toast";
import { fetchMerchantOrders, paymentLinks } from "@/mock/fixtures";
import type { LocalOutcome, Order, OrderOrigin, ProviderState } from "@/mock/types";
import { DataTable } from "@/components/ui/DataTable";
import type { Column } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import type { FilterChip } from "@/components/ui/FilterBar";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/CopyField";
import { MoneyText } from "@/components/ui/MoneyText";
import { LocalOutcomeBadge, ProviderStateBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

const ORIGINS: OrderOrigin[] = ["LINK", "STANDALONE", "AD_HOC"];
const PROVIDER_STATES: ProviderState[] = ["created", "pending", "indeterminate", "confirmed", "rejected", "cancelled", "expired", "refunded"];
const OUTCOMES: LocalOutcome[] = ["none", "in-progress", "finalized"];
const OUTCOME_KEY: Record<LocalOutcome, DictKey> = {
  none: "status.none",
  "in-progress": "status.inProgress",
  finalized: "status.finalized",
};
const PAGE_SIZES = [10, 25, 50];

function OriginBadge({ origin }: { origin: OrderOrigin }) {
  const { t } = useI18n();
  const cls =
    origin === "LINK" ? "bg-accent-soft text-text" : origin === "STANDALONE" ? "bg-info-soft text-info" : "bg-surface-2 text-text-2";
  return <span className={cn("inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium", cls)}>{t(`source.${origin}` as DictKey)}</span>;
}

const payerOf = (o: Order) => (o.kind === "v1" ? o.payer : o.customer);
const amountOf = (o: Order) => (o.kind === "v1" ? o.amount : o.total);

const selectCls =
  "h-10 rounded-md border border-border bg-surface px-2.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)]";
const dateCls =
  "h-10 rounded-md border border-border bg-surface px-2.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)]";

export default function MerchantOrders() {
  const { t, formatDateTime } = useI18n();
  const { user } = useSession();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [allOrders, setAllOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setError(false);
    try {
      if (params.get("mockError") === "1") throw new Error("mock");
      setAllOrders(await fetchMerchantOrders(user.id));
    } catch {
      setAllOrders(null);
      setError(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---- URL-synced filter params (invalid ones are ignored + info toast) ----
  const myLinks = useMemo(() => paymentLinks.filter((l) => l.merchantId === user?.id), [user?.id]);

  const { filters, invalidFound } = useMemo(() => {
    const invalid: string[] = [];
    const q = params.get("q") ?? "";
    const source = params.get("source");
    const currency = params.get("currency");
    const state = params.get("state");
    const outcome = params.get("outcome");
    const link = params.get("link");
    const from = params.get("from");
    const to = params.get("to");
    const parsed = {
      q,
      source: ORIGINS.includes(source as OrderOrigin) ? (source as OrderOrigin) : null,
      currency: currency === "BRL" ? currency : null,
      state: PROVIDER_STATES.includes(state as ProviderState) ? (state as ProviderState) : null,
      outcome: OUTCOMES.includes(outcome as LocalOutcome) ? (outcome as LocalOutcome) : null,
      link: link && myLinks.some((l) => l.id === link) ? link : null,
      from: from && !Number.isNaN(Date.parse(from)) ? from : null,
      to: to && !Number.isNaN(Date.parse(to)) ? to : null,
    };
    if (source && !parsed.source) invalid.push("source");
    if (currency && !parsed.currency) invalid.push("currency");
    if (state && !parsed.state) invalid.push("state");
    if (outcome && !parsed.outcome) invalid.push("outcome");
    if (link && !parsed.link) invalid.push("link");
    if (from && !parsed.from) invalid.push("from");
    if (to && !parsed.to) invalid.push("to");
    return { filters: parsed, invalidFound: invalid.length > 0 };
  }, [params, myLinks]);

  useEffect(() => {
    if (invalidFound) toast("info", t("orders.invalidParams"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invalidFound]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    if (!allOrders) return [];
    const q = filters.q.trim().toLowerCase();
    const fromTs = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null;
    const toTs = filters.to ? new Date(`${filters.to}T23:59:59`).getTime() : null;
    return allOrders.filter((o) => {
      const p = payerOf(o);
      if (filters.source && o.origin !== filters.source) return false;
      if (filters.currency && amountOf(o).currency !== filters.currency) return false;
      if (filters.state && o.providerState !== filters.state) return false;
      if (filters.outcome && o.localOutcome !== filters.outcome) return false;
      if (filters.link && (o.kind !== "v2" || o.paymentLinkId !== filters.link)) return false;
      const created = new Date(o.createdAt).getTime();
      if (fromTs && created < fromTs) return false;
      if (toTs && created > toTs) return false;
      if (q) {
        const hay = [p.name, p.email, o.id, o.kind === "v2" ? o.paymentLinkIdentifier : null]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allOrders, filters]);

  // ---- Pagination (clamped + toast) ----
  const rawPage = Number(params.get("page") ?? "1");
  const rawSize = Number(params.get("pageSize") ?? "25");
  const pageSize = PAGE_SIZES.includes(rawSize) ? rawSize : 25;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, Number.isFinite(rawPage) ? rawPage : 1), pageCount);

  useEffect(() => {
    if (allOrders && rawPage > pageCount) {
      toast("info", t("orders.pageClamped"));
      const next = new URLSearchParams(params);
      next.set("page", String(pageCount));
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOrders, rawPage, pageCount]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const hasFilters =
    !!filters.q || !!filters.source || !!filters.currency || !!filters.state || !!filters.outcome || !!filters.link || !!filters.from || !!filters.to;

  const clearAll = () => setParams(new URLSearchParams(), { replace: true });

  const chips: FilterChip[] = [];
  if (filters.source) chips.push({ key: "source", label: `${t("orders.filter.source")}: ${t(`source.${filters.source}` as DictKey)}`, onRemove: () => setParam("source", null) });
  if (filters.currency) chips.push({ key: "currency", label: `${t("orders.filter.currency")}: ${filters.currency} / PIX`, onRemove: () => setParam("currency", null) });
  if (filters.state) chips.push({ key: "state", label: `${t("orders.filter.providerState")}: ${t(`status.${filters.state}` as DictKey)}`, onRemove: () => setParam("state", null) });
  if (filters.outcome) chips.push({ key: "outcome", label: `${t("orders.filter.outcome")}: ${t(OUTCOME_KEY[filters.outcome])}`, onRemove: () => setParam("outcome", null) });
  if (filters.link) {
    const link = myLinks.find((l) => l.id === filters.link);
    chips.push({ key: "link", label: `${t("orders.filter.link")}: ${link?.identifier ?? filters.link}`, onRemove: () => setParam("link", null) });
  }
  if (filters.from) chips.push({ key: "from", label: `${t("orders.filter.from")}: ${filters.from}`, onRemove: () => setParam("from", null) });
  if (filters.to) chips.push({ key: "to", label: `${t("orders.filter.to")}: ${filters.to}`, onRemove: () => setParam("to", null) });

  const columns: Column<Order>[] = [
    {
      key: "payer",
      header: t("orders.col.payer"),
      render: (o) => {
        const p = payerOf(o);
        const summary = p.name ?? p.email ?? "—";
        return (
          <span className="block max-w-44 truncate" title={summary}>
            {summary}
          </span>
        );
      },
    },
    { key: "source", header: t("orders.col.source"), render: (o) => <OriginBadge origin={o.origin} /> },
    {
      key: "link",
      header: t("orders.col.link"),
      render: (o) =>
        o.kind === "v2" ? (
          <span onClick={(e) => e.stopPropagation()}>
            <CopyField value={o.paymentLinkIdentifier} />
          </span>
        ) : (
          <span className="text-text-3">—</span>
        ),
    },
    { key: "state", header: t("orders.col.providerState"), render: (o) => <ProviderStateBadge state={o.providerState} /> },
    { key: "outcome", header: t("orders.col.outcome"), render: (o) => <LocalOutcomeBadge outcome={o.localOutcome} /> },
    {
      key: "amount",
      header: t("orders.col.amount"),
      className: "text-right",
      render: (o) => <MoneyText money={amountOf(o)} showPair />,
    },
    {
      key: "created",
      header: t("orders.col.created"),
      render: (o) => <span className="whitespace-nowrap text-xs text-text-2">{formatDateTime(o.createdAt)}</span>,
    },
    {
      key: "actions",
      header: t("orders.col.actions"),
      render: (o) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(o.kind === "v2" ? `/orders/v2/${o.id}` : `/orders/${o.id}`);
          }}
        >
          {t("orders.open")}
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-app space-y-4">
      <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-text">{t("orders.title")}</h1>

      <FilterBar
        searchPlaceholder={t("orders.searchPlaceholder")}
        chips={chips}
        onClearAll={clearAll}
      >
        <select aria-label={t("orders.filter.source")} value={filters.source ?? ""} onChange={(e) => setParam("source", e.target.value || null)} className={selectCls}>
          <option value="">{t("orders.filter.source")}</option>
          {ORIGINS.map((s) => (
            <option key={s} value={s}>{t(`source.${s}` as DictKey)}</option>
          ))}
        </select>
        <select aria-label={t("orders.filter.currency")} value={filters.currency ?? ""} onChange={(e) => setParam("currency", e.target.value || null)} className={selectCls}>
          <option value="">{t("orders.filter.currency")}</option>
          <option value="BRL">BRL / PIX</option>
        </select>
        <select aria-label={t("orders.filter.providerState")} value={filters.state ?? ""} onChange={(e) => setParam("state", e.target.value || null)} className={selectCls}>
          <option value="">{t("orders.filter.providerState")}</option>
          {PROVIDER_STATES.map((s) => (
            <option key={s} value={s}>{t(`status.${s}` as DictKey)}</option>
          ))}
        </select>
        <select aria-label={t("orders.filter.outcome")} value={filters.outcome ?? ""} onChange={(e) => setParam("outcome", e.target.value || null)} className={selectCls}>
          <option value="">{t("orders.filter.outcome")}</option>
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>{t(OUTCOME_KEY[o])}</option>
          ))}
        </select>
        <select aria-label={t("orders.filter.link")} value={filters.link ?? ""} onChange={(e) => setParam("link", e.target.value || null)} className={selectCls}>
          <option value="">{t("orders.filter.link")}</option>
          {myLinks.map((l) => (
            <option key={l.id} value={l.id}>{l.identifier}</option>
          ))}
        </select>
        <input type="date" aria-label={t("orders.filter.from")} value={filters.from ?? ""} onChange={(e) => setParam("from", e.target.value || null)} className={dateCls} />
        <input type="date" aria-label={t("orders.filter.to")} value={filters.to ?? ""} onChange={(e) => setParam("to", e.target.value || null)} className={dateCls} />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={pageRows}
        rowKey={(o) => o.id}
        loading={allOrders === null && !error}
        error={error}
        onRetry={() => void load()}
        emptyVariant={hasFilters ? "filtered" : "empty"}
        emptyIllustration="orders"
        emptyTitle={hasFilters ? t("common.noResultsFiltered") : t("empty.orders.title")}
        emptyBody={hasFilters ? undefined : t("orders.emptyBody")}
        onClearFilters={clearAll}
        emptyAction={
          <Button asChild>
            <Link to="/links/new">{t("dash.createLink")}</Link>
          </Button>
        }
        onRowClick={(o) => navigate(o.kind === "v2" ? `/orders/v2/${o.id}` : `/orders/${o.id}`)}
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={(p) => setParam("page", p === 1 ? null : String(p))}
        onPageSizeChange={(s) => {
          const next = new URLSearchParams(params);
          next.set("pageSize", String(s));
          next.delete("page");
          setParams(next, { replace: true });
        }}
      />
    </div>
  );
}
