import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/i18n";
import { useSession } from "@/mock/session";
import type { OrderV2, PaymentLinkV2 } from "@/mock/types";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/CopyField";
import { EmptyState } from "@/components/ui/EmptyState";
import { MoneyText } from "@/components/ui/MoneyText";
import { DetailSkeleton } from "@/components/ui/Skeletons";
import { LinkLifecycleBadge, LocalOutcomeBadge, ProviderStateBadge } from "@/components/ui/StatusBadge";
import { fetchLink, fetchLinkOrder } from "./linkStore";
import { LinksBreadcrumb, SectionCard, ErrorNotice, formCls } from "./shared";

/** `/links/v2/:id/orders/:orderId` — order detail inside the link context (both ownership fences). */
export default function LinkOrderDetail() {
  const { t, locale, formatDateTime } = useI18n();
  const { user } = useSession();
  const navigate = useNavigate();
  const { id = "", orderId = "" } = useParams();

  const [link, setLink] = useState<PaymentLinkV2 | null>(null);
  const [order, setOrder] = useState<OrderV2 | null>(null);
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
        const o = await fetchLinkOrder(user.id, l.id, orderId);
        if (!o) {
          setState("unavailable");
          return;
        }
        setLink(l);
        setOrder(o);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [user, id, orderId]);

  useEffect(load, [load]);

  if (state === "loading") return <DetailSkeleton />;
  if (state === "error")
    return <ErrorNotice message={t("common.requestError")} retryLabel={t("common.retry")} onRetry={load} />;
  if (state === "unavailable" || !link || !order)
    return (
      <div className="rounded-card border border-border bg-surface shadow-card">
        <EmptyState illustration="unavailable" title={t("common.unavailable")} body={t("common.unavailableBody")} />
      </div>
    );

  const payerField = (label: string, value: string | null) => (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-text-3">{label}</span>
      <span className={value ? "text-text" : "text-text-3"}>{value ?? t("links.orderDetail.notProvided")}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <LinksBreadcrumb
        items={[
          { label: t("links.breadcrumb"), to: "/links" },
          { label: `#${link.identifier}`, to: `/links/v2/${link.id}`, mono: true },
          { label: t("links.orders.title"), to: `/links/v2/${link.id}/orders` },
          { label: `#${order.id}`, mono: true },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <CopyField value={order.id} truncate={false} />
        <ProviderStateBadge state={order.providerState} />
        <LocalOutcomeBadge outcome={order.localOutcome} />
        <Button variant="secondary" size="sm" className="ml-auto" onClick={() => navigate(`/links/v2/${link.id}/orders`)}>
          <ArrowLeft aria-hidden /> {t("links.orderDetail.back")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <SectionCard title={t("links.orderDetail.composition")} index={0}>
            {order.items.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-text-3">
                    <th className="py-1">{t("links.detail.products")}</th>
                    <th className="py-1 text-right">{t("links.new.qty")}</th>
                    <th className="py-1 text-right">{t("links.new.unitPrice")}</th>
                    <th className="py-1 text-right">{t("links.new.lineTotal")}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-2 text-text">{item.title[locale] || item.title["pt-BR"]}</td>
                      <td className="py-2 text-right font-money text-text-2">{item.quantity}</td>
                      <td className="py-2 text-right"><MoneyText money={item.unitPrice} /></td>
                      <td className="py-2 text-right"><MoneyText money={{ amount: Math.round(item.unitPrice.amount * item.quantity * 100) / 100, currency: "BRL" }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex items-center justify-between">
                <span className={formCls.label}>{t("links.detail.fixedAmount")}</span>
                <MoneyText money={order.total} showPair />
              </div>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className={formCls.label}>{t("links.new.total")}</span>
              <MoneyText money={order.total} size="lg" showPair />
            </div>
          </SectionCard>

          <SectionCard title={t("links.orderDetail.payer")} index={1}>
            <div className="space-y-2">
              {payerField(t("links.orderDetail.name"), order.customer.name)}
              {payerField(t("links.orderDetail.email"), order.customer.email)}
              {payerField(t("links.orderDetail.document"), order.customer.document)}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <SectionCard title={t("links.orderDetail.state")} index={2}>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-text-3">{t("links.orderDetail.provider")}</dt>
                <dd><ProviderStateBadge state={order.providerState} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-text-3">{t("links.orderDetail.outcome")}</dt>
                <dd><LocalOutcomeBadge outcome={order.localOutcome} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-text-3">{t("links.orderDetail.link")}</dt>
                <dd className="flex items-center gap-2">
                  <CopyField value={link.identifier} />
                  <LinkLifecycleBadge lifecycle={link.lifecycle} />
                </dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title={t("links.orderDetail.timestamps")} index={3}>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-text-3">{t("links.detail.createdAt")}</dt>
                <dd className="text-text-2">{formatDateTime(order.createdAt)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-text-3">{t("links.detail.updatedAt")}</dt>
                <dd className="text-text-2">{formatDateTime(order.updatedAt)}</dd>
              </div>
            </dl>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
