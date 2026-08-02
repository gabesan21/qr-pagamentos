import { useMemo, useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { useI18n } from "@/i18n";
import type { DictKey } from "@/i18n";
import { useToast } from "@/components/ui/Toast";
import { StatCard } from "@/components/ui/StatCard";
import { MoneyText } from "@/components/ui/MoneyText";
import { Monogram } from "@/components/ui/Monogram";
import { CardSkeleton, TableSkeleton } from "@/components/ui/Skeletons";
import { Button } from "@/components/ui/button";
import type { DashboardStats, OrderOrigin, ProviderState } from "@/mock/types";
import { dashboardStatsByPeriod, mockFetch } from "@/mock/fixtures";
import { SegmentedControl, cardCls, fadeUp, useMockQuery } from "./shared";

type Period = DashboardStats["period"];

const origins: OrderOrigin[] = ["LINK", "STANDALONE", "AD_HOC"];
const providerOrder: ProviderState[] = ["created", "pending", "indeterminate", "confirmed", "rejected", "cancelled", "expired", "refunded"];
const originChip: Record<OrderOrigin, string> = {
  LINK: "bg-accent-soft text-text",
  STANDALONE: "bg-info-soft text-info",
  AD_HOC: "bg-surface-2 text-text-2",
};

export default function AdminDashboard() {
  const { t, formatNumber } = useI18n();
  const { toast } = useToast();
  const [period, setPeriod] = useState<Period>("7d");
  const [stale, setStale] = useState<DashboardStats | null>(null);

  const { data, loading, error, retry } = useMockQuery<DashboardStats>(async () => {
    try {
      const d = await mockFetch(dashboardStatsByPeriod[period], 450);
      setStale(d);
      return d;
    } catch (e) {
      toast("error", t("admin.couldNotLoad"), { onRetry: () => retry() });
      throw e;
    }
  }, [period]);

  const stats = data ?? stale;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl leading-8 font-semibold tracking-[-0.02em] text-text">{t("admin.overview")}</h1>
          <p className="mt-1 text-sm text-text-2">{t("admin.overviewCaption")}</p>
        </div>
        <SegmentedControl<Period>
          layoutId="admin-period"
          ariaLabel={t("common.dateRange")}
          value={period}
          onChange={setPeriod}
          options={[
            { value: "today", label: t("admin.period.today") },
            { value: "7d", label: t("admin.period.7d") },
            { value: "30d", label: t("admin.period.30d") },
          ]}
        />
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-card border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          <span className="flex items-center gap-2">
            <AlertCircle className="size-4" aria-hidden />
            {t("admin.couldNotLoad")}
          </span>
          <Button variant="secondary" size="sm" onClick={retry}>
            {t("common.retry")}
          </Button>
        </div>
      )}
      {stale && error && <p className="text-xs text-text-3">{t("admin.stale")}</p>}

      {/* Row 1 — users */}
      {loading && !stats ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard index={0} label={t("admin.users.total")} value={formatNumber(stats.users.total)} caption={t("admin.users.totalCaption")} />
          <StatCard index={1} label={t("admin.users.active")} value={formatNumber(stats.users.active)} delta={`${formatNumber(stats.users.active)}`} deltaDirection="up" />
          <StatCard
            index={2}
            label={t("admin.users.deleted")}
            value={
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-danger" aria-hidden />
                {formatNumber(stats.users.deleted)}
              </span>
            }
          />
        </div>
      ) : null}

      {/* Row 2 — orders & sales & funnel */}
      <div className="grid gap-4 lg:grid-cols-12">
        <motion.div {...fadeUp(1)} className={`${cardCls} lg:col-span-5`}>
          <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.ordersInPeriod")}</h2>
          {loading && !stats ? (
            <TableSkeleton rows={4} columns={2} />
          ) : stats ? (
            <>
              <div className="mt-3 font-display text-[30px] leading-[38px] font-bold text-text">{formatNumber(stats.orders.created)}</div>
              <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
                {origins.map((o) => {
                  const count = stats.ordersByOrigin?.[o] ?? 0;
                  const pct = stats.orders.created ? (count / stats.orders.created) * 100 : 0;
                  const cls = o === "LINK" ? "bg-accent" : o === "STANDALONE" ? "bg-info" : "bg-text-3";
                  return pct > 0 ? <div key={o} className={cls} style={{ width: `${pct}%` }} /> : null;
                })}
              </div>
              <ul className="mt-3 space-y-1.5">
                {origins.map((o) => (
                  <li key={o} className="flex items-center justify-between text-sm">
                    <span className={`rounded-pill px-2 py-0.5 text-xs font-medium ${originChip[o]}`}>{t(`admin.origin.${o}`)}</span>
                    <span className="font-money text-text">{formatNumber(stats.ordersByOrigin?.[o] ?? 0)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-text-3">{t("admin.byProviderState")}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {providerOrder
                    .filter((s) => (stats.orders.byProviderState[s] ?? 0) > 0)
                    .map((s) => (
                      <span key={s} className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-text-2">
                        {t(`status.${s}` as DictKey)} <span className="font-money">{stats.orders.byProviderState[s]}</span>
                      </span>
                    ))}
                </div>
              </div>
            </>
          ) : null}
        </motion.div>

        <motion.div {...fadeUp(2)} className={`${cardCls} lg:col-span-4`}>
          {loading && !stats ? (
            <TableSkeleton rows={4} columns={1} />
          ) : stats ? (
            <div className="space-y-4">
              {(
                [
                  ["admin.sales.providerConfirmed", stats.sales.providerConfirmed],
                  ["admin.sales.locallyFinalized", stats.sales.locallyFinalized],
                ] as const
              ).map(([key, money], i) => (
                <div key={key}>
                  <div className={`-mx-5 ${i === 0 ? "-mt-5 rounded-t-card" : ""} border-b border-border bg-surface-2 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-text-3`}>
                    {t(key)}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <MoneyText money={money} size="lg" showPair />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </motion.div>

        <motion.div {...fadeUp(3)} className={`${cardCls} lg:col-span-3`}>
          <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.funnel")}</h2>
          {loading && !stats ? (
            <TableSkeleton rows={3} columns={1} />
          ) : stats ? (
            <Funnel stats={stats} />
          ) : null}
        </motion.div>
      </div>

      {/* Row 3 — inventory */}
      {loading && !stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard index={0} label={t("admin.links.total")} value={formatNumber(stats.links.total)} />
          <StatCard index={1} label={t("admin.links.active")} value={formatNumber(stats.links.active)} />
          <StatCard index={2} label={t("admin.products.active")} value={formatNumber(stats.products.active)} />
          <StatCard index={3} label={t("admin.products.archived")} value={formatNumber(stats.products.archived)} />
        </div>
      ) : null}

      {/* Row 4 — leaderboards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div {...fadeUp(1)} className={cardCls}>
          <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.topMerchants")}</h2>
          {loading && !stats ? (
            <TableSkeleton rows={5} columns={3} />
          ) : stats && (stats.topMerchants?.length ?? 0) > 0 ? (
            <ol className="mt-3 space-y-1">
              {stats.topMerchants!.map((m, i) => (
                <li key={m.userId}>
                  <Link
                    to={`/admin/orders?merchant=${encodeURIComponent(m.username)}`}
                    className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-2"
                  >
                    <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft font-money text-xs font-semibold text-text">{i + 1}</span>
                    <Monogram name={m.username} size={28} />
                    <span className={`text-sm font-medium text-text ${m.deleted ? "line-through" : ""}`}>{m.username}</span>
                    {m.deleted && <span className="rounded-pill bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">{t("status.deleted")}</span>}
                    <span className="ml-auto font-money text-sm text-text">{formatNumber(m.confirmedOrders)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : stats ? (
            <div className="mt-4 flex flex-col items-center py-6 text-center">
              <img src="/empty-users.svg" alt="" width={120} height={120} />
              <p className="mt-2 text-sm text-text-2">{t("admin.emptyLeaderboardMerchants")}</p>
            </div>
          ) : null}
        </motion.div>

        <motion.div {...fadeUp(2)} className={cardCls}>
          <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.topProducts")}</h2>
          {loading && !stats ? (
            <TableSkeleton rows={5} columns={3} />
          ) : stats && (stats.topProducts?.length ?? 0) > 0 ? (
            <TopProductsRows products={stats.topProducts!} />
          ) : stats ? (
            <div className="mt-4 flex flex-col items-center py-6 text-center">
              <img src="/empty-products.svg" alt="" width={120} height={120} />
              <p className="mt-2 text-sm text-text-2">{t("admin.emptyLeaderboardProducts")}</p>
            </div>
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}

function TopProductsRows({ products }: { products: NonNullable<DashboardStats["topProducts"]> }) {
  const { locale, formatNumber } = useI18n();
  return (
    <ol className="mt-3 space-y-1">
      {products.map((p) => (
        <li key={p.productId} className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-2">
          <img src="/product-fallback.svg" alt="" width={32} height={32} className="rounded-md border border-border" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{p.title[locale] || p.title["pt-BR"]}</span>
          <span className="font-money text-xs text-text-2">×{formatNumber(p.quantity)}</span>
          <MoneyText money={p.revenue} showPair />
        </li>
      ))}
    </ol>
  );
}

function Funnel({ stats }: { stats: DashboardStats }) {
  const { t, formatNumber } = useI18n();
  const total = stats.funnel.converted + stats.funnel.inProgress + stats.funnel.abandoned || 1;
  const rows = useMemo(
    () =>
      [
        { key: "admin.funnel.converted" as const, count: stats.funnel.converted, cls: "bg-success", width: 100 },
        { key: "admin.funnel.inProgress" as const, count: stats.funnel.inProgress, cls: "bg-info", width: 72 },
        { key: "admin.funnel.abandoned" as const, count: stats.funnel.abandoned, cls: "bg-text-3", width: 44 },
      ] as const,
    [stats],
  );
  return (
    <div className="mt-4 space-y-4">
      {rows.map((r) => {
        const rate = Math.round((r.count / total) * 100);
        return (
          <div key={r.key} title={`${formatNumber(r.count)} · ${rate}%`}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-2">{t(r.key)}</span>
              <span className="font-money text-text">
                {formatNumber(r.count)} · {rate}%
              </span>
            </div>
            <div className="mt-1.5 h-2.5 rounded-full bg-surface-2" style={{ width: `${r.width}%` }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(4, (r.count / total) * 100)}%` }}
                transition={{ duration: 0.4 }}
                className={`h-full rounded-full ${r.cls}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
