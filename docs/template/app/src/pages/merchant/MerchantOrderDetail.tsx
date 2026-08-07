import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { DictKey } from "@/i18n";
import { useSession } from "@/mock/session";
import { useToast } from "@/components/ui/Toast";
import { addMerchantOrderComment, fetchMerchantOrder, paymentLinks, recordLocalOutcome } from "@/mock/fixtures";
import type { Order, OrderComment, OrderOrigin } from "@/mock/types";
import { CopyField } from "@/components/ui/CopyField";
import { MoneyText } from "@/components/ui/MoneyText";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailSkeleton } from "@/components/ui/Skeletons";
import { Button } from "@/components/ui/button";
import { LinkLifecycleBadge, LocalOutcomeBadge, ProviderStateBadge } from "@/components/ui/StatusBadge";
import { Timeline } from "@/components/ui/Timeline";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Monogram } from "@/components/ui/Monogram";

const ORIGIN_KEY: Record<OrderOrigin, DictKey> = {
  LINK: "source.LINK",
  STANDALONE: "source.STANDALONE",
  AD_HOC: "source.AD_HOC",
};

function Card({ title, children, index = 0, className }: { title: string; children: React.ReactNode; index?: number; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={cn("rounded-card border border-border bg-surface p-5 shadow-card", className)}
    >
      <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text">{title}</h2>
      <div className="mt-3">{children}</div>
    </motion.section>
  );
}

function FieldRow({ label, value, notCollected }: { label: string; value: string | null | undefined; notCollected: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
      <span className="text-sm text-text-2">{label}</span>
      {value ? (
        <CopyField value={value} />
      ) : (
        <span className="text-sm text-text-3" title={notCollected}>
          —
        </span>
      )}
    </div>
  );
}

export default function MerchantOrderDetail({ kind }: { kind: "v1" | "v2" }) {
  const { id = "" } = useParams();
  const { t, locale, formatDateTime } = useI18n();
  const { user } = useSession();
  const { toast } = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "unavailable" | "error">("loading");

  const [commentBody, setCommentBody] = useState("");
  const [commentPending, setCommentPending] = useState(false);
  const [commentError, setCommentError] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [outcomeSel, setOutcomeSel] = useState<"in-progress" | "finalized">("in-progress");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [outcomePending, setOutcomePending] = useState(false);
  const [outcomeError, setOutcomeError] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setPhase("loading");
    try {
      const found = await fetchMerchantOrder(user.id, id, kind);
      setOrder(found);
      setPhase(found ? "ready" : "unavailable");
    } catch {
      setPhase("error");
    }
  }, [user?.id, id, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
  }, [load]);

  const link = useMemo(
    () => (order?.kind === "v2" ? paymentLinks.find((l) => l.id === order.paymentLinkId) ?? null : null),
    [order],
  );

  if (!user) return null;

  // ---- ONE safe unavailable state: unknown / cross-owner / unavailable ----
  if (phase === "unavailable") {
    return (
      <div className="mx-auto w-full max-w-app">
        <div className="rounded-card border border-border bg-surface shadow-card">
          <EmptyState
            illustration="unavailable"
            title={t("order.unavailable")}
            body={t("order.unavailableBody")}
            action={
              <Button variant="secondary" asChild>
                <Link to="/orders">{t("order.backToOrders")}</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="mx-auto w-full max-w-app">
        <div className="flex items-center gap-3 rounded-card border border-border bg-danger-soft px-4 py-3 text-sm text-text" role="alert">
          <AlertCircle className="size-4 shrink-0 text-danger" aria-hidden />
          <span className="flex-1">{t("common.requestError")}</span>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t("common.retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "loading" || !order) {
    return (
      <div className="mx-auto w-full max-w-app">
        <DetailSkeleton />
      </div>
    );
  }

  const payer = order.kind === "v1" ? order.payer : order.customer;
  const canEditOutcome = order.kind === "v2" && order.providerState === "confirmed";

  const submitComment = async () => {
    const body = commentBody.trim();
    if (!body || commentPending) return;
    setCommentPending(true);
    setCommentError(false);
    try {
      const created: OrderComment | null = await addMerchantOrderComment(user.id, order.id, body);
      if (!created) throw new Error("mock");
      setOrder({ ...order, comments: [...order.comments, created], updatedAt: created.createdAt });
      setCommentBody("");
      setHighlightId(created.id);
      setTimeout(() => setHighlightId(null), 1500);
      toast("success", t("order.comment.added"));
    } catch {
      setCommentError(true);
    } finally {
      setCommentPending(false);
    }
  };

  const submitOutcome = async () => {
    if (outcomePending) return;
    setOutcomePending(true);
    setOutcomeError(false);
    try {
      const updated = await recordLocalOutcome(user.id, order.id, outcomeSel);
      if (!updated) throw new Error("mock");
      setOrder(updated);
      setConfirmOpen(false);
      setOutcomeNote("");
      toast("success", t("order.outcome.updated"));
    } catch {
      setOutcomeError(true);
      setConfirmOpen(false);
    } finally {
      setOutcomePending(false);
    }
  };

  const timelineEntries = [...order.comments]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((c) => ({ id: c.id, title: c.author, body: c.body, at: c.createdAt, tone: "info" as const }));

  return (
    <div className="mx-auto w-full max-w-app space-y-4">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm text-text-3">
        <Link to="/orders" className="hover:text-text">{t("orders.title")}</Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="font-money text-text">#{order.id}</span>
      </nav>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Left column */}
        <div className="space-y-4 lg:col-span-8">
          <Card title={t("order.summary")} index={0}>
            <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-text-3">{t("order.identifier")}</div>
                <CopyField value={order.id} truncate={false} className="mt-1" />
              </div>
              <div>
                <div className="text-xs font-medium text-text-3">{t("order.source")}</div>
                <div className="mt-1.5 text-sm font-medium text-text">{t(ORIGIN_KEY[order.origin])}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-text-3">{t("order.createdAt")}</div>
                <div className="mt-1 font-money text-xs text-text-2">{formatDateTime(order.createdAt)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-text-3">{t("order.updatedAt")}</div>
                <div className="mt-1 font-money text-xs text-text-2">{formatDateTime(order.updatedAt)}</div>
              </div>
            </div>
          </Card>

          <Card title={t("order.composition")} index={1}>
            {order.kind === "v1" ? (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-text-2">{t("order.fixedAmount")}</span>
                <MoneyText money={order.amount} size="lg" showPair />
              </div>
            ) : (
              <div className="space-y-3">
                {order.items.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-3">
                        <th className="py-2 pr-3">{t("order.col.item")}</th>
                        <th className="py-2 pr-3 text-right">{t("order.col.qty")}</th>
                        <th className="py-2 pr-3 text-right">{t("order.col.unit")}</th>
                        <th className="py-2 text-right">{t("order.col.lineTotal")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item) => (
                        <tr key={item.productId} className="border-b border-border last:border-0">
                          <td className="py-2.5 pr-3 text-text">{item.title[locale] ?? item.title["pt-BR"]}</td>
                          <td className="py-2.5 pr-3 text-right font-money text-text-2">{item.quantity}</td>
                          <td className="py-2.5 pr-3 text-right"><MoneyText money={item.unitPrice} /></td>
                          <td className="py-2.5 text-right">
                            <MoneyText money={{ amount: Math.round(item.quantity * item.unitPrice.amount * 100) / 100, currency: item.unitPrice.currency }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-text-2">{t("order.fixedAmount")}</span>
                    <MoneyText money={order.total} showPair />
                  </div>
                )}
                <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
                  <span className="text-sm font-medium text-text">{t("order.total")}</span>
                  <MoneyText money={order.total} size="lg" showPair />
                </div>
              </div>
            )}
          </Card>

          <Card title={t("order.payer")} index={2}>
            <div className="divide-y divide-border">
              <FieldRow label={t("order.payer.name")} value={payer.name} notCollected={t("order.notCollected")} />
              <FieldRow label={t("order.payer.email")} value={payer.email} notCollected={t("order.notCollected")} />
              <FieldRow label={t("order.payer.document")} value={payer.document} notCollected={t("order.notCollected")} />
              <FieldRow label={t("order.payer.address")} value={payer.address ?? null} notCollected={t("order.notCollected")} />
            </div>
          </Card>

          <Card title={t("order.paymentData")} index={3}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-text-2">{t("order.paymentRef")}</span>
              {order.paymentRef ? (
                <CopyField value={order.paymentRef} truncate={false} />
              ) : (
                <span className="text-sm text-text-3">—</span>
              )}
            </div>
          </Card>

          {/* V2-only: local outcome editor */}
          {order.kind === "v2" && (
            <Card title={t("order.outcome.title")} index={4}>
              {canEditOutcome ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      aria-label={t("order.outcome.title")}
                      value={outcomeSel}
                      onChange={(e) => setOutcomeSel(e.target.value as "in-progress" | "finalized")}
                      className="h-10 rounded-md border border-border bg-surface px-2.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)]"
                    >
                      <option value="in-progress">{t("status.inProgress")}</option>
                      <option value="finalized">{t("status.finalized")}</option>
                    </select>
                    <input
                      value={outcomeNote}
                      onChange={(e) => setOutcomeNote(e.target.value)}
                      placeholder={t("order.outcome.note")}
                      className="h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-3 focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)]"
                    />
                    <Button onClick={() => setConfirmOpen(true)} disabled={outcomeSel === order.localOutcome}>
                      {t("order.outcome.record")}
                    </Button>
                  </div>
                  {outcomeError && (
                    <div className="flex items-center gap-2 text-sm text-danger" role="alert">
                      <AlertCircle className="size-4" aria-hidden />
                      {t("common.requestError")}
                      <button type="button" onClick={() => setConfirmOpen(true)} className="font-medium underline">
                        {t("common.retry")}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <LocalOutcomeBadge outcome={order.localOutcome} />
                  <span className="text-xs text-text-3">{t("order.outcome.readonlyWhy")}</span>
                </div>
              )}
            </Card>
          )}

          {/* V2-only: comments timeline */}
          {order.kind === "v2" && (
            <Card title={t("order.comments")} index={5}>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Monogram name={user.username} size={32} className="shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <textarea
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder={t("order.comment.placeholder")}
                      rows={2}
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-3 focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)]"
                    />
                    {commentError && (
                      <div className="flex items-center gap-2 text-sm text-danger" role="alert">
                        <AlertCircle className="size-4" aria-hidden />
                        {t("common.requestError")}
                        <button type="button" onClick={() => void submitComment()} className="font-medium underline">
                          {t("common.retry")}
                        </button>
                      </div>
                    )}
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => void submitComment()} disabled={!commentBody.trim() || commentPending}>
                        {commentPending ? t("common.loading") : t("order.comment.add")}
                      </Button>
                    </div>
                  </div>
                </div>
                {order.comments.length === 0 ? (
                  <p className="text-sm text-text-3">{t("order.comments.empty")}</p>
                ) : (
                  <AnimatePresence initial={false}>
                    <motion.div
                      key={order.comments.length}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={cn("rounded-md transition-colors", highlightId && "bg-accent-soft p-2")}
                    >
                      <Timeline entries={timelineEntries} />
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4 lg:col-span-4">
          <Card title={t("order.state.provider")} index={1}>
            <div className="space-y-4">
              <div>
                <ProviderStateBadge state={order.providerState} />
                <p className="mt-1.5 text-xs text-text-3">{t("order.state.providerCaption")}</p>
              </div>
              <div className="border-t border-border pt-4">
                <div className="text-xs font-medium text-text-3">{t("order.state.local")}</div>
                <div className="mt-1.5"><LocalOutcomeBadge outcome={order.localOutcome} /></div>
                <p className="mt-1.5 text-xs text-text-3">{t("order.state.localCaption")}</p>
              </div>
            </div>
          </Card>

          {link && (
            <Card title={t("order.relatedLink")} index={2}>
              <div className="space-y-3">
                <CopyField value={link.identifier} truncate={false} />
                <div><LinkLifecycleBadge lifecycle={link.lifecycle} /></div>
                <Button variant="secondary" size="sm" asChild>
                  <Link to={`/links/v2/${link.id}`}>{t("order.viewLink")}</Link>
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void submitOutcome()}
        title={t("order.outcome.confirmTitle")}
        body={t("order.outcome.confirmBody")}
        confirmLabel={t("order.outcome.record")}
        destructive={false}
        loading={outcomePending}
      />
    </div>
  );
}
