import { Link, useParams } from "react-router";
import { ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/i18n";
import { CopyField } from "@/components/ui/CopyField";
import { MoneyText } from "@/components/ui/MoneyText";
import { Monogram } from "@/components/ui/Monogram";
import { DetailSkeleton } from "@/components/ui/Skeletons";
import { LinkLifecycleBadge, ProviderStateBadge, LocalOutcomeBadge } from "@/components/ui/StatusBadge";
import { mockFetch, orders, paymentLinks, products, users } from "@/mock/fixtures";
import { DataUnavailable } from "./unavailable";
import { cardCls, fadeUp, useMockQuery } from "./shared";

export default function AdminLinkDetail() {
  const { id } = useParams();
  const { t, locale, formatDateTime } = useI18n();
  const { data, loading, error, retry } = useMockQuery(() => mockFetch(paymentLinks.find((l) => l.id === id) ?? null, 500), [id]);

  if (loading) return <DetailSkeleton />;
  if (error) return <DataUnavailable kind="error" onRetry={retry} />;
  const link = data;
  if (!link) return <DataUnavailable kind="unavailable" backTo="/admin/payment-links" backLabel={t("admin.backToLinks")} />;

  const merchant = users.find((u) => u.id === link.merchantId);
  const linkOrders = orders.filter((o) => o.kind === "v2" && o.paymentLinkId === link.id).slice(0, 5);
  const expired = link.expiresAt !== null && new Date(link.expiresAt).getTime() < Date.now();
  const lineItems = link.productIds
    .map((pid) => products.find((p) => p.id === pid))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const subtotal = Math.round(lineItems.reduce((s, p) => s + p.price.amount, 0) * 100) / 100;

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1 text-sm text-text-3" aria-label="breadcrumb">
        <Link to="/admin/payment-links" className="hover:text-text">
          {t("admin.linksTitle")}
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="font-money text-text">#{link.identifier}</span>
      </nav>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <motion.section {...fadeUp(0)} className={cardCls}>
            <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.summary")}</h2>
            <div className="mt-3 space-y-3">
              <CopyField value={link.identifier} truncate={false} />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-text-3">{t("admin.publicUrl")}</p>
                <div className="mt-1.5">
                  <CopyField value={`${window.location.origin}/pay/${link.identifier}`} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <LinkLifecycleBadge lifecycle={link.lifecycle} />
                <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-2">{t(link.type === "reusable" ? "admin.type.reusable" : "admin.type.singleUse")}</span>
                <span className={`rounded-pill px-2 py-0.5 text-xs font-medium ${link.composition === "products" ? "bg-accent-soft text-text" : "bg-info-soft text-info"}`}>
                  {t(link.composition === "products" ? "admin.composition.products" : "admin.composition.fixed")}
                </span>
              </div>
            </div>
          </motion.section>

          <motion.section {...fadeUp(1)} className={cardCls}>
            <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.descriptions")}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(["pt-BR", "en"] as const).map((l) => (
                <div key={l} className="rounded-md border border-border bg-surface-2 p-3">
                  <p className="text-[11px] font-semibold uppercase text-text-3">{l === "pt-BR" ? "PT-BR" : "EN"}</p>
                  <p className="mt-1 text-sm text-text">{link.title[l] || "—"}</p>
                  <p className="mt-0.5 text-sm text-text-2">{link.description[l] || "—"}</p>
                </div>
              ))}
            </div>
          </motion.section>

          <motion.section {...fadeUp(2)} className={cardCls}>
            <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.composition")}</h2>
            {link.composition === "fixed" && link.fixedAmount ? (
              <div className="mt-3">
                <MoneyText money={link.fixedAmount} size="lg" showPair />
              </div>
            ) : (
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {lineItems.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="py-2 text-text">{p.title[locale] || p.title["pt-BR"]}</td>
                      <td className="py-2 text-right">
                        <MoneyText money={p.price} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="pt-2 text-xs font-semibold uppercase text-text-3">
                      {t("admin.subtotal")} · BRL / PIX
                    </td>
                    <td className="pt-2 text-right">
                      <MoneyText money={{ amount: subtotal, currency: "BRL" }} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </motion.section>
        </div>

        <div className="space-y-4 lg:col-span-4">
          {merchant && (
            <motion.section {...fadeUp(1)} className={cardCls}>
              <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.col.merchant")}</h2>
              <Link to={`/admin/orders?merchant=${encodeURIComponent(merchant.username)}`} className="mt-3 flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2">
                <Monogram name={merchant.username} size={32} />
                <span>
                  <span className={`block text-sm font-medium text-text ${merchant.state === "deleted" ? "line-through" : ""}`}>{merchant.username}</span>
                  <span className="block text-xs text-text-3">
                    {t("admin.storeDisplayName")}: {merchant.storefront.displayName[locale] || merchant.storefront.displayName["pt-BR"]}
                  </span>
                </span>
              </Link>
            </motion.section>
          )}

          <motion.section {...fadeUp(2)} className={cardCls}>
            <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.lifecycleCard")}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-2">{t("admin.createdAt")}</dt>
                <dd className="font-money text-xs text-text">{formatDateTime(link.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-2">{t("admin.updatedAt")}</dt>
                <dd className="font-money text-xs text-text">{formatDateTime(link.updatedAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-2">{t("admin.expiresAt")}</dt>
                <dd className={`font-money text-xs ${expired ? "text-danger" : "text-text"}`}>{link.expiresAt ? formatDateTime(link.expiresAt) : "—"}</dd>
              </div>
            </dl>
          </motion.section>

          <motion.section {...fadeUp(3)} className={cardCls}>
            <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{t("admin.associatedOrders")}</h2>
            {linkOrders.length === 0 ? (
              <p className="mt-3 text-sm text-text-2">{t("admin.noAssociatedOrders")}</p>
            ) : (
              <ol className="mt-3 space-y-1">
                {linkOrders.map((o, i) => (
                  <motion.li key={o.id} {...fadeUp(i)}>
                    <Link to={`/admin/orders/v2/${o.id}`} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-surface-2">
                      <span className="min-w-0 flex-1 truncate font-money text-xs text-text-2">{o.id}</span>
                      <ProviderStateBadge state={o.providerState} />
                      <LocalOutcomeBadge outcome={o.localOutcome} />
                      <MoneyText money={o.kind === "v2" ? o.total : o.amount} />
                    </Link>
                  </motion.li>
                ))}
              </ol>
            )}
            <Link to={`/admin/orders?link=${encodeURIComponent(link.identifier)}`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              {t("admin.viewAll")} <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
