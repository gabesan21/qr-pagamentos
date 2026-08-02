import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { motion } from "framer-motion";
import { ExternalLink, GitBranch, ListOrdered, Pencil, Power } from "lucide-react";
import { useI18n } from "@/i18n";
import { useSession } from "@/mock/session";
import type { OrderV2, PaymentLinkV2 } from "@/mock/types";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/CopyField";
import { EmptyState } from "@/components/ui/EmptyState";
import { MoneyText } from "@/components/ui/MoneyText";
import { ConfirmDialog } from "@/components/ui/Modal";
import { DetailSkeleton } from "@/components/ui/Skeletons";
import { LinkLifecycleBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { canActivate, canDeactivate, fetchLink, fetchLinkOrders, publicPayUrl, resolveProduct, setLifecycle } from "./linkStore";
import { LinksBreadcrumb, PairChip, SectionCard, ErrorNotice, formCls } from "./shared";

/** `/links/v2/:id` — owner-scoped link detail. */
export default function LinkDetail() {
  const { t, locale, formatDateTime } = useI18n();
  const { user } = useSession();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { id = "" } = useParams();

  const [link, setLink] = useState<PaymentLinkV2 | null>(null);
  const [orders, setOrders] = useState<OrderV2[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [confirm, setConfirm] = useState<"activate" | "deactivate" | null>(null);
  const [acting, setActing] = useState(false);

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
        setState("ready");
        const os = await fetchLinkOrders(user.id, l.id).catch(() => [] as OrderV2[]);
        setOrders(os);
      })
      .catch(() => setState("error"));
  }, [user, id]);

  useEffect(load, [load]);

  const summary = useMemo(() => {
    const confirmed = orders.filter((o) => o.providerState === "confirmed");
    const volume = confirmed.reduce((s, o) => s + o.total.amount, 0);
    return { total: orders.length, confirmed: confirmed.length, volume: Math.round(volume * 100) / 100 };
  }, [orders]);

  if (state === "loading") return <DetailSkeleton />;
  if (state === "error")
    return <ErrorNotice message={t("common.requestError")} retryLabel={t("common.retry")} onRetry={load} />;
  if (state === "unavailable" || !link)
    return (
      <div className="rounded-card border border-border bg-surface shadow-card">
        <EmptyState illustration="unavailable" title={t("common.unavailable")} body={t("common.unavailableBody")} />
      </div>
    );

  const payUrl = publicPayUrl(link.identifier);
  const settled = link.type === "single-use" && link.lifecycle === "paid";
  const expiredBlocked = link.lifecycle === "expired" && !canActivate(link);
  const lines = link.productLines ?? link.productIds.map((pid) => ({ productId: pid, quantity: 1 }));
  const lineRows = lines.map((l) => ({ line: l, product: resolveProduct(l.productId) }));
  const subtotal = lineRows.reduce((s, r) => s + (r.product ? r.product.price.amount * r.line.quantity : 0), 0);

  const doLifecycle = () => {
    if (!confirm) return;
    setActing(true);
    setLifecycle(user!.id, link.id, confirm === "activate" ? "active" : "inactive")
      .then((updated) => {
        setActing(false);
        setConfirm(null);
        if (!updated) {
          toast("error", t("links.detail.actionFailed"), { onRetry: doLifecycle });
          return;
        }
        setLink(updated);
        toast("success", t(confirm === "activate" ? "links.detail.activated" : "links.detail.deactivated"));
      })
      .catch(() => {
        setActing(false);
        setConfirm(null);
        toast("error", t("links.detail.actionFailed"));
      });
  };

  return (
    <div className="space-y-4">
      <LinksBreadcrumb
        items={[{ label: t("links.breadcrumb"), to: "/links" }, { label: `#${link.identifier}`, mono: true }]}
      />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className="flex flex-wrap items-center gap-3">
        <CopyField value={link.identifier} truncate={false} />
        <motion.span key={link.lifecycle} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <LinkLifecycleBadge lifecycle={link.lifecycle} />
        </motion.span>
        <span className="rounded-pill border border-border px-2 py-0.5 text-xs text-text-2">
          {t(link.type === "reusable" ? "links.type.reusable" : "links.type.singleUse")}
        </span>
        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-2">
          {t(link.composition === "products" ? "links.comp.products" : "links.comp.fixed")}
        </span>
      </motion.div>

      {/* Header actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => window.open(payUrl, "_blank", "noopener")}>
          <ExternalLink aria-hidden /> {t("links.detail.openCheckout")}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/links/v2/${link.id}/edit`)}>
          <Pencil aria-hidden /> {t("links.detail.edit")}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/links/new?from=${link.id}`)}>
          <GitBranch aria-hidden /> {t("links.detail.newVersion")}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/links/v2/${link.id}/orders`)}>
          <ListOrdered aria-hidden /> {t("links.detail.viewOrders")}
        </Button>
        {canDeactivate(link) && (
          <Button variant="secondary" size="sm" onClick={() => setConfirm("deactivate")}>
            <Power aria-hidden /> {t("links.detail.deactivate")}
          </Button>
        )}
        {canActivate(link) && (
          <Button variant="secondary" size="sm" onClick={() => setConfirm("activate")}>
            <Power aria-hidden /> {t("links.detail.activate")}
          </Button>
        )}
        {expiredBlocked && (
          <span title={t("links.detail.reactivateDisabled")}>
            <Button variant="secondary" size="sm" disabled>
              <Power aria-hidden /> {t("links.detail.activate")}
            </Button>
          </span>
        )}
      </div>
      {settled && <p className="text-xs text-text-3">{t("links.detail.settledCaption")}</p>}
      {expiredBlocked && <p className="text-xs text-text-3">{t("links.detail.reactivateDisabled")}</p>}

      {/* Body 8+4 */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <SectionCard title={t("links.detail.summary")} index={0}>
            <div className="space-y-3 text-sm">
              <div>
                <p className={formCls.label}>{t("links.detail.descriptionPt")}</p>
                <p className="mt-0.5 text-text-2">{link.description["pt-BR"] || "—"}</p>
              </div>
              <div>
                <p className={formCls.label}>{t("links.detail.descriptionEn")}</p>
                <p className="mt-0.5 text-text-2">{link.description.en || "—"}</p>
              </div>
              <div className="grid gap-2 border-t border-border pt-3 text-xs text-text-2 sm:grid-cols-3">
                <div>
                  <p className="text-text-3">{t("links.detail.createdAt")}</p>
                  <p>{formatDateTime(link.createdAt)}</p>
                </div>
                <div>
                  <p className="text-text-3">{t("links.detail.updatedAt")}</p>
                  <p>{formatDateTime(link.updatedAt)}</p>
                </div>
                <div>
                  <p className="text-text-3">{t("links.detail.expiresAt")}</p>
                  <p>{link.expiresAt ? formatDateTime(link.expiresAt) : t("links.noExpiration")}</p>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t("links.detail.composition")} index={1}>
            {link.composition === "fixed" && link.fixedAmount ? (
              <div className="flex items-center justify-between">
                <span className={formCls.label}>{t("links.detail.fixedAmount")}</span>
                <MoneyText money={link.fixedAmount} size="lg" showPair />
              </div>
            ) : (
              <div className="space-y-2">
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
                    {lineRows.map(({ line, product }) => (
                      <tr key={line.productId} className="border-t border-border">
                        <td className="py-2 text-text">
                          {product ? product.title[locale] || product.title["pt-BR"] : line.productId}
                          {product && product.state !== "active" && (
                            <span className="ml-2 rounded-pill bg-warning-soft px-2 py-0.5 text-[11px] text-warning">
                              {t("links.detail.productUnavailable")}
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right font-money text-text-2">{line.quantity}</td>
                        <td className="py-2 text-right">{product && <MoneyText money={product.price} />}</td>
                        <td className="py-2 text-right">
                          {product && <MoneyText money={{ amount: Math.round(product.price.amount * line.quantity * 100) / 100, currency: "BRL" }} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className={formCls.label}>{t("links.detail.subtotal")}</span>
                  <MoneyText money={{ amount: Math.round(subtotal * 100) / 100, currency: "BRL" }} size="lg" showPair />
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <SectionCard title={t("links.detail.publicUrl")} index={2}>
            <CopyField value={payUrl} className="w-full" />
            <div className="mt-3">
              <PairChip />
            </div>
          </SectionCard>

          <SectionCard title={t("links.detail.ordersSummary")} index={3}>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-text-3">{t("links.detail.ordersTotal")}</dt>
                <dd className="font-money text-text">{summary.total}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-text-3">{t("links.detail.ordersConfirmed")}</dt>
                <dd className="font-money text-text">{summary.confirmed}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <dt className="text-text-3">{t("links.detail.ordersVolume")}</dt>
                <dd><MoneyText money={{ amount: summary.volume, currency: "BRL" }} showPair /></dd>
              </div>
            </dl>
            <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={() => navigate(`/links/v2/${link.id}/orders`)}>
              {t("links.detail.viewOrders")}
            </Button>
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={doLifecycle}
        loading={acting}
        destructive={confirm === "deactivate"}
        title={t(confirm === "activate" ? "links.detail.confirmActivateTitle" : "links.detail.confirmDeactivateTitle")}
        body={t(confirm === "activate" ? "links.detail.confirmActivateBody" : "links.detail.confirmDeactivateBody")}
        confirmLabel={t(confirm === "activate" ? "links.detail.activate" : "links.detail.deactivate")}
      />
    </div>
  );
}
