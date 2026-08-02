import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, ExternalLink, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { DictKey } from "@/i18n";
import { useSession } from "@/mock/session";
import { fetchMerchantDashboard } from "@/mock/fixtures";
import type { DashboardPeriod, MerchantDashboardData, Money, Order, ProviderState } from "@/mock/types";
import { StatCard } from "@/components/ui/StatCard";
import { MoneyText } from "@/components/ui/MoneyText";
import { EmptyState } from "@/components/ui/EmptyState";
import { CardSkeleton, StatGridSkeleton } from "@/components/ui/Skeletons";
import { Button } from "@/components/ui/button";
import { SimpleTabs } from "@/components/ui/SimpleTabs";
import { ProviderStateBadge, LocalOutcomeBadge } from "@/components/ui/StatusBadge";

const PERIODS: Array<{ id: DashboardPeriod; key: DictKey }> = [
  { id: "today", key: "dash.period.today" },
  { id: "7d", key: "dash.period.7d" },
  { id: "30d", key: "dash.period.30d" },
];

const PROVIDER_ORDER: ProviderState[] = [
  "created", "pending", "indeterminate", "confirmed", "rejected", "cancelled", "expired", "refunded",
];

function SalesValue({ pairs, emptyLabel }: { pairs: Money[]; emptyLabel: string }) {
  if (pairs.length === 0) return <span className="text-text-3">{emptyLabel}</span>;
  return (
    <span className="flex flex-col gap-1">
      {pairs.map((m) => (
        <MoneyText key={m.currency} money={m} size="lg" showPair />
      ))}
    </span>
  );
}

export default function MerchantDashboard() {
  const { t, formatNumber, formatDateTime } = useI18n();
  const { user } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const simulateError = searchParams.get("mockError") === "1";

  const [period, setPeriod] = useState<DashboardPeriod>("7d");
  const [data, setData] = useState<MerchantDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stale, setStale] = useState(false);
  const [chartTab, setChartTab] = useState<"state" | "source">("state");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (simulateError) throw new Error("mock");
      const d = await fetchMerchantDashboard(user.id, period);
      setData(d);
      setError(false);
      setStale(false);
    } catch {
      // Keep previous data as stale if present; otherwise full error strip.
      setError(true);
      setStale((prev) => prev || data !== null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, period, simulateError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) return null;

  const storefrontOk = user.storefront.enabled && !!user.storefront.slug;

  const payerSummary = (o: Order) => {
    const p = o.kind === "v1" ? o.payer : o.customer;
    return p.name ?? p.email ?? "—";
  };

  const funnelTotal = data ? data.funnel.converted + data.funnel.inProgress + data.funnel.abandoned : 0;
  const funnelRows: Array<{ key: DictKey; value: number; bar: string }> = data
    ? [
        { key: "dash.funnel.converted", value: data.funnel.converted, bar: "bg-success" },
        { key: "dash.funnel.inProgress", value: data.funnel.inProgress, bar: "bg-info" },
        { key: "dash.funnel.abandoned", value: data.funnel.abandoned, bar: "bg-danger" },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-app space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-text">{t("dash.title")}</h1>
          <p className="mt-1 text-sm text-text-2">{t("dash.greeting", { username: user.username })}</p>
        </div>
        <div className="flex items-center gap-3">
          {storefrontOk && (
            <Button variant="secondary" asChild>
              <Link to={`/pay/${user.storefront.slug}`}>
                <ExternalLink className="size-4" aria-hidden />
                {t("dash.viewStore")}
              </Link>
            </Button>
          )}
          {/* Period segmented control */}
          <div className="flex rounded-md border border-border bg-surface-2 p-0.5" role="tablist" aria-label={t("common.dateRange")}>
            {PERIODS.map((p) => {
              const selected = p.id === period;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setPeriod(p.id)}
                  className={cn("relative rounded-[6px] px-3 py-1.5 text-sm font-medium transition-colors", selected ? "text-text" : "text-text-3 hover:text-text-2")}
                >
                  {selected && (
                    <motion.span layoutId="dash-period-pill" className="absolute inset-0 rounded-[6px] bg-surface shadow-card" transition={{ duration: 0.16 }} />
                  )}
                  <span className="relative">{t(p.key)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {!storefrontOk && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-info-soft px-4 py-3 text-sm text-text">
          <Store className="size-4 shrink-0 text-info" aria-hidden />
          <span className="min-w-0 flex-1">{t("dash.storeBanner")}</span>
          <Button variant="secondary" size="sm" asChild>
            <Link to="/settings">{t("dash.storeBannerCta")}</Link>
          </Button>
        </div>
      )}

      {error && !stale && (
        <div className="flex items-center gap-3 rounded-card border border-border bg-danger-soft px-4 py-3 text-sm text-text" role="alert">
          <AlertCircle className="size-4 shrink-0 text-danger" aria-hidden />
          <span className="flex-1">{t("dash.errorTitle")}</span>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t("common.retry")}
          </Button>
        </div>
      )}
      {stale && <p className="text-xs text-text-3">{t("dash.stale")}</p>}

      {loading && !data ? (
        <div className="space-y-4">
          <StatGridSkeleton count={4} />
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-7"><CardSkeleton /></div>
            <div className="lg:col-span-5"><CardSkeleton /></div>
          </div>
          <StatGridSkeleton count={4} />
        </div>
      ) : data && data.isFirstRun ? (
        <>
          <div className="rounded-card border border-border bg-surface shadow-card">
            <EmptyState
              illustration="orders"
              title={t("dash.emptyTitle")}
              body={t("dash.emptyBody")}
              action={
                <Button asChild>
                  <Link to="/links/new">{t("dash.createLink")}</Link>
                </Button>
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard index={0} label={t("dash.ordersInPeriod")} value="0" />
            <StatCard index={1} label={t("dash.confirmedSales")} value={<span className="text-text-3">{t("dash.noSales")}</span>} />
            <StatCard index={2} label={t("dash.localFinalized")} value={<span className="text-text-3">{t("dash.noSales")}</span>} />
            <StatCard index={3} label={t("dash.conversionRate")} value="0%" />
          </div>
        </>
      ) : data ? (
        <>
          {/* Row 1 — key stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              index={0}
              label={t("dash.ordersInPeriod")}
              value={formatNumber(data.ordersInPeriod)}
              caption={`${t("source.LINK")} ${data.byOrigin.LINK} · ${t("source.STANDALONE")} ${data.byOrigin.STANDALONE} · ${t("source.AD_HOC")} ${data.byOrigin.AD_HOC}`}
            />
            <StatCard
              index={1}
              label={t("dash.confirmedSales")}
              value={<SalesValue pairs={data.providerConfirmedSales} emptyLabel={t("dash.noSales")} />}
              caption={t("dash.confirmedSalesCaption")}
            />
            <StatCard
              index={2}
              label={t("dash.localFinalized")}
              value={<SalesValue pairs={data.locallyFinalizedSales} emptyLabel={t("dash.noSales")} />}
              caption={t("dash.localFinalizedCaption")}
            />
            <StatCard
              index={3}
              label={t("dash.conversionRate")}
              value={`${formatNumber(data.conversionRate * 100, { maximumFractionDigits: 1 })}%`}
              sparkline={[funnelTotal, data.funnel.converted + data.funnel.inProgress, data.funnel.converted]}
            />
          </div>

          {/* Row 2 — charts + funnel */}
          <div className="grid gap-4 lg:grid-cols-12">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-card border border-border bg-surface p-5 shadow-card lg:col-span-7"
            >
              <SimpleTabs
                tabs={[
                  { id: "state", label: t("dash.byState") },
                  { id: "source", label: t("dash.bySource") },
                ]}
                active={chartTab}
                onChange={(id) => setChartTab(id as "state" | "source")}
              />
              <div className="mt-4 space-y-2.5">
                {chartTab === "state"
                  ? PROVIDER_ORDER.map((s) => {
                      const count = data.byProviderState[s];
                      const max = Math.max(1, ...PROVIDER_ORDER.map((x) => data.byProviderState[x]));
                      return (
                        <div key={s} className="flex items-center gap-3">
                          <div className="w-32 shrink-0"><ProviderStateBadge state={s} /></div>
                          <div className="h-2 flex-1 rounded-pill bg-surface-2">
                            <motion.div className="h-2 rounded-pill bg-accent" initial={{ width: 0 }} animate={{ width: `${(count / max) * 100}%` }} transition={{ duration: 0.3 }} />
                          </div>
                          <span className="w-8 text-right font-money text-xs text-text-2">{count}</span>
                        </div>
                      );
                    })
                  : (["LINK", "STANDALONE", "AD_HOC"] as const).map((s) => {
                      const count = data.byOrigin[s];
                      const max = Math.max(1, data.byOrigin.LINK, data.byOrigin.STANDALONE, data.byOrigin.AD_HOC);
                      return (
                        <div key={s} className="flex items-center gap-3">
                          <div className="w-32 shrink-0 text-sm font-medium text-text">{t(`source.${s}` as DictKey)}</div>
                          <div className="h-2 flex-1 rounded-pill bg-surface-2">
                            <motion.div className="h-2 rounded-pill bg-accent" initial={{ width: 0 }} animate={{ width: `${(count / max) * 100}%` }} transition={{ duration: 0.3 }} />
                          </div>
                          <span className="w-8 text-right font-money text-xs text-text-2">{count}</span>
                        </div>
                      );
                    })}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-card border border-border bg-surface p-5 shadow-card lg:col-span-5"
            >
              <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("dash.funnel")}</h2>
              <div className="mt-4 space-y-4">
                {funnelRows.map((row) => {
                  const rate = funnelTotal === 0 ? 0 : (row.value / funnelTotal) * 100;
                  return (
                    <div key={row.key} title={`${formatNumber(row.value)} · ${formatNumber(rate, { maximumFractionDigits: 1 })}%`}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-text-2">{t(row.key)}</span>
                        <span className="font-money text-xs text-text">
                          {formatNumber(row.value)} <span className="text-text-3">({formatNumber(rate, { maximumFractionDigits: 1 })}%)</span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-pill bg-surface-2">
                        <motion.div className={cn("h-2 rounded-pill", row.bar)} initial={{ width: 0 }} animate={{ width: `${rate}%` }} transition={{ duration: 0.35 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>

          {/* Row 3 — inventory stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard index={4} label={t("dash.activeLinks")} value={formatNumber(data.links.active)} />
            <StatCard index={5} label={t("dash.totalLinks")} value={formatNumber(data.links.total)} />
            <StatCard index={6} label={t("dash.activeProducts")} value={formatNumber(data.products.active)} />
            <StatCard index={7} label={t("dash.archivedProducts")} value={formatNumber(data.products.archived)} />
          </div>

          {/* Row 4 — leading products + recent orders */}
          <div className="grid gap-4 lg:grid-cols-12">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-card border border-border bg-surface p-5 shadow-card lg:col-span-7"
            >
              <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("dash.leadingProducts")}</h2>
              <ul className="mt-3 divide-y divide-border">
                {data.leadingProducts.length === 0 && <li className="py-6 text-center text-sm text-text-3">{t("dash.noSales")}</li>}
                {data.leadingProducts.map(({ product, confirmedQty, revenue }) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/catalog/products/${product.id}`)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <img src={product.imageUrl ?? "/product-fallback.svg"} alt="" className="size-10 shrink-0 rounded-md border border-border object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text">{product.title[user.locale] ?? product.title["pt-BR"]}</span>
                        <span className="block text-xs text-text-3">
                          {t("dash.confirmedQty")}: <span className="font-money">{formatNumber(confirmedQty)}</span>
                        </span>
                      </span>
                      <MoneyText money={revenue} showPair />
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col rounded-card border border-border bg-surface p-5 shadow-card lg:col-span-5"
            >
              <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("dash.recentOrders")}</h2>
              <ul className="mt-3 flex-1 divide-y divide-border">
                {data.recentOrders.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => navigate(o.kind === "v2" ? `/orders/v2/${o.id}` : `/orders/${o.id}`)}
                      className="flex w-full flex-wrap items-center gap-2 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-money text-xs text-text">#{o.id}</span>
                        <span className="block truncate text-xs text-text-3">
                          {payerSummary(o)} · {formatDateTime(o.createdAt)}
                        </span>
                      </span>
                      <ProviderStateBadge state={o.providerState} />
                      <LocalOutcomeBadge outcome={o.localOutcome} />
                      <MoneyText money={o.kind === "v1" ? o.amount : o.total} />
                    </button>
                  </li>
                ))}
              </ul>
              <Link to="/orders" className="mt-3 inline-flex items-center gap-1.5 self-end text-sm font-medium text-accent hover:underline">
                {t("dash.viewAll")}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </motion.div>
          </div>
        </>
      ) : null}
    </div>
  );
}
