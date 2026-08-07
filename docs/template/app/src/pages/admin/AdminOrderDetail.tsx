import { Link, useParams } from "react-router";
import { ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/i18n";
import { DataUnavailable } from "@/pages/admin/unavailable";
import { CopyField } from "@/components/ui/CopyField";
import { MoneyText } from "@/components/ui/MoneyText";
import { Monogram } from "@/components/ui/Monogram";
import { DetailSkeleton } from "@/components/ui/Skeletons";
import { ProviderStateBadge, LocalOutcomeBadge, LinkLifecycleBadge } from "@/components/ui/StatusBadge";
import { Timeline } from "@/components/ui/Timeline";
import type { TimelineEntry } from "@/components/ui/Timeline";
import type { DictKey } from "@/i18n";
import type { Order } from "@/mock/types";
import { mockFetch, orders, paymentLinks, users } from "@/mock/fixtures";
import { cardCls, fadeUp, orderOrigin, useMockQuery } from "./shared";

function formatCpf(doc: string) {
  const d = doc.replace(/\D/g, "").padEnd(11, "0").slice(0, 11);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export default function AdminOrderDetail({ kind }: { kind: "v1" | "v2" }) {
  const { id } = useParams();
  const { t, locale, formatDateTime } = useI18n();
  const { data, loading, error, retry } = useMockQuery(() => mockFetch(orders.find((o) => o.id === id) ?? null, 500), [id]);

  if (loading) return <DetailSkeleton />;
  if (error) return <DataUnavailable kind="error" onRetry={retry} />;
  const order = data as Order | null;
  if (!order || order.kind !== kind) return <DataUnavailable kind="unavailable" backTo="/admin/orders" backLabel={t("admin.backToOrders")} />;

  const merchant = users.find((u) => u.id === order.merchantId);
  const payer = order.kind === "v1" ? order.payer : order.customer;
  const link = order.kind === "v2" ? paymentLinks.find((l) => l.id === order.paymentLinkId) : undefined;
  const orig = orderOrigin(order);

  const timeline: TimelineEntry[] = [
    { id: "created", title: t("admin.tl.created"), at: order.createdAt, tone: "info" },
    { id: "provider", title: `${t("admin.tl.providerTransition")}: ${t(`status.${order.providerState}` as DictKey)}`, at: order.updatedAt, tone: order.providerState === "confirmed" ? "success" : ["rejected", "cancelled", "expired"].includes(order.providerState) ? "danger" : "default" },
  ];
  if (order.localOutcome !== "none") {
    timeline.push({ id: "outcome", title: `${t("admin.tl.outcome")}: ${t(order.localOutcome === "finalized" ? "status.finalized" : "status.inProgress")}`, at: order.updatedAt, tone: order.localOutcome === "finalized" ? "success" : "info" });
  }

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1 text-sm text-text-3" aria-label="breadcrumb">
        <Link to="/admin/orders" className="hover:text-text">
          {t("admin.ordersTitle")}
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="font-money text-text">#{order.id}</span>
      </nav>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <motion.section {...fadeUp(0)} className={cardCls}>
            <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.summary")}</h2>
            <div className="mt-3 space-y-3">
              <CopyField value={order.id} truncate={false} />
              <div className="flex flex-wrap gap-4 text-sm text-text-2">
                <span>
                  {t("admin.createdAt")}: <time className="font-money text-text">{formatDateTime(order.createdAt)}</time>
                </span>
                <span>
                  {t("admin.updatedAt")}: <time className="font-money text-text">{formatDateTime(order.updatedAt)}</time>
                </span>
                <span className="rounded-pill bg-accent-soft px-2 py-0.5 text-xs font-medium text-text">{t(`admin.origin.${orig}` as DictKey)}</span>
              </div>
              {merchant && (
                <Link to={`/admin/orders?merchant=${encodeURIComponent(merchant.username)}`} className="flex w-fit items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2">
                  <Monogram name={merchant.username} size={28} />
                  <span className="text-sm font-medium text-text">{merchant.username}</span>
                  <span className="text-xs text-text-3">→ {t("admin.viewMerchantOrders")}</span>
                </Link>
              )}
            </div>
          </motion.section>

          <motion.section {...fadeUp(1)} className={cardCls}>
            <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.amountCard")}</h2>
            <div className="mt-3">
              <MoneyText money={order.kind === "v1" ? order.amount : order.total} size="lg" showPair />
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-text-3">{t("admin.composition")}</p>
              {order.kind === "v1" ? (
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-text-2">{t("admin.fixedAmountLine")}</span>
                  <MoneyText money={order.amount} />
                </div>
              ) : (
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {order.items.map((it, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="py-2 text-text">{it.title[locale] || it.title["pt-BR"]}</td>
                        <td className="py-2 font-money text-text-2">×{it.quantity}</td>
                        <td className="py-2 text-right"><MoneyText money={it.unitPrice} /></td>
                        <td className="py-2 text-right"><MoneyText money={{ amount: Math.round(it.quantity * it.unitPrice.amount * 100) / 100, currency: "BRL" }} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="pt-2 text-xs font-semibold uppercase text-text-3">
                        {t("admin.subtotal")} · BRL / PIX
                      </td>
                      <td className="pt-2 text-right">
                        <MoneyText money={order.total} />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </motion.section>

          <motion.section {...fadeUp(2)} className={cardCls}>
            <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.payerCard")}</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              {(
                [
                  ["name", payer.name],
                  ["email", payer.email],
                  ["document", payer.document ? formatCpf(payer.document) : null],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <dt className="text-text-2 capitalize">{k === "document" ? "CPF" : k === "name" ? (locale === "en" ? "Name" : "Nome") : "E-mail"}</dt>
                  <dd>
                    {v ? <CopyField value={v} truncate={false} /> : <span className="text-text-3">— <span className="text-xs">({t("admin.notRequiredByPolicy")})</span></span>}
                  </dd>
                </div>
              ))}
            </dl>
          </motion.section>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <motion.section {...fadeUp(1)} className={cardCls}>
            <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.stateCard")}</h2>
            <div className="mt-3 space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-text-3">{t("admin.providerStateLabel")}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <ProviderStateBadge state={order.providerState} />
                  <time className="font-money text-xs text-text-3">{formatDateTime(order.updatedAt)}</time>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-text-3">{t("admin.localOutcomeLabel")}</p>
                <div className="mt-1.5">
                  <LocalOutcomeBadge outcome={order.localOutcome} />
                </div>
                <p className="mt-1 text-xs text-text-3">{t("admin.recordedByMerchant")}</p>
              </div>
            </div>
          </motion.section>

          {link && (
            <motion.section {...fadeUp(2)} className={cardCls}>
              <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.linkCard")}</h2>
              <div className="mt-3 space-y-2.5">
                <CopyField value={link.identifier} truncate={false} />
                <div>
                  <LinkLifecycleBadge lifecycle={link.lifecycle} />
                </div>
                <Link to={`/admin/payment-links/v2/${link.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                  {t("admin.viewLink")} <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            </motion.section>
          )}

          <motion.section {...fadeUp(3)} className={cardCls}>
            <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.chronology")}</h2>
            <Timeline entries={timeline} className="mt-4" />
          </motion.section>
        </div>
      </div>
    </div>
  );
}
