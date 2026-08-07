import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/i18n";
import { useSession } from "@/mock/session";
import type { OrderV2, PaymentLinkV2 } from "@/mock/types";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/DataTable";
import type { Column } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import { MoneyText } from "@/components/ui/MoneyText";
import { CopyField } from "@/components/ui/CopyField";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailSkeleton } from "@/components/ui/Skeletons";
import { LinkLifecycleBadge, LocalOutcomeBadge, ProviderStateBadge } from "@/components/ui/StatusBadge";
import { fetchLink, fetchLinkOrders } from "./linkStore";
import { LinksBreadcrumb, ErrorNotice } from "./shared";

/** `/links/v2/:id/orders` — owner-scoped orders of one link. */
export default function LinkOrders() {
  const { t, formatDateTime } = useI18n();
  const { user } = useSession();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();

  const [link, setLink] = useState<PaymentLinkV2 | null>(null);
  const [orders, setOrders] = useState<OrderV2[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");

  const load = useCallback(() => {
    if (!user) return;
    setState("loading");
    fetchLink(user.id, id)
      .then(async (l) => {
        if (!l) {
          setState("unavailable");
          return;
        }
        setLink(l);
        const os = await fetchLinkOrders(user.id, l.id);
        setOrders(os.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [user, id]);

  useEffect(load, [load]);

  const q = (params.get("q") ?? "").toLowerCase();
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = Number(params.get("pageSize") ?? "10") || 10;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    if (!orders) return [];
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        (o.customer.name ?? "").toLowerCase().includes(q) ||
        (o.customer.email ?? "").toLowerCase().includes(q),
    );
  }, [orders, q]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  if (state === "loading") return <DetailSkeleton />;
  if (state === "error")
    return <ErrorNotice message={t("common.requestError")} retryLabel={t("common.retry")} onRetry={load} />;
  if (state === "unavailable" || !link)
    return (
      <div className="rounded-card border border-border bg-surface shadow-card">
        <EmptyState illustration="unavailable" title={t("common.unavailable")} body={t("common.unavailableBody")} />
      </div>
    );

  const columns: Column<OrderV2>[] = [
    {
      key: "order",
      header: t("links.orders.col.order"),
      render: (o) => (
        <span className="flex flex-col gap-1">
          <span onClick={(e) => e.stopPropagation()}>
            <CopyField value={o.id} />
          </span>
          <span className="text-xs text-text-2">{o.customer.name ?? o.customer.email ?? t("links.orderDetail.notProvided")}</span>
        </span>
      ),
    },
    { key: "provider", header: t("links.orders.col.provider"), render: (o) => <ProviderStateBadge state={o.providerState} /> },
    { key: "outcome", header: t("links.orders.col.outcome"), render: (o) => <LocalOutcomeBadge outcome={o.localOutcome} /> },
    { key: "amount", header: t("links.col.amount"), mono: true, render: (o) => <MoneyText money={o.total} /> },
    { key: "created", header: t("links.orders.col.created"), render: (o) => <span className="text-xs text-text-2">{formatDateTime(o.createdAt)}</span> },
    {
      key: "actions",
      header: t("links.col.actions"),
      render: (o) => (
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/links/v2/${link.id}/orders/${o.id}`); }}>
          {t("links.open")}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <LinksBreadcrumb
        items={[
          { label: t("links.breadcrumb"), to: "/links" },
          { label: `#${link.identifier}`, to: `/links/v2/${link.id}`, mono: true },
          { label: t("links.orders.title") },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <CopyField value={link.identifier} truncate={false} />
        <LinkLifecycleBadge lifecycle={link.lifecycle} />
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => navigate(`/links/v2/${link.id}`)}>
          <ArrowLeft aria-hidden /> {t("links.orders.backToLink")}
        </Button>
      </div>

      <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-text">{t("links.orders.title")}</h1>

      <FilterBar searchPlaceholder={t("links.orders.searchPlaceholder")} onClearAll={() => setParams(new URLSearchParams(), { replace: true })} />

      <DataTable<OrderV2>
        columns={columns}
        rows={pageRows}
        rowKey={(o) => o.id}
        loading={orders === null}
        emptyVariant={q ? "filtered" : "empty"}
        emptyIllustration="orders"
        emptyTitle={t("links.orders.empty.title")}
        emptyBody={t("links.orders.empty.body")}
        onClearFilters={() => setParams(new URLSearchParams(), { replace: true })}
        page={clampedPage}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => setParam("page", String(p))}
        onPageSizeChange={(s) => setParam("pageSize", String(s))}
        onRowClick={(o) => navigate(`/links/v2/${link.id}/orders/${o.id}`)}
      />
    </div>
  );
}
