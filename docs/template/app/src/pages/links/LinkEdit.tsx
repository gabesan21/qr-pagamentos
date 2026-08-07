import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { GitBranch, TriangleAlert } from "lucide-react";
import { useI18n } from "@/i18n";
import { useSession } from "@/mock/session";
import type { PaymentLinkV2 } from "@/mock/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailSkeleton } from "@/components/ui/Skeletons";
import { useToast } from "@/components/ui/Toast";
import { fetchLink, updateLink } from "./linkStore";
import { LinkForm, toMoney } from "./LinkForm";
import type { LinkFormValues } from "./LinkForm";
import { LinksBreadcrumb, ErrorNotice } from "./shared";

/** `/links/v2/:id/edit` — edit mutable fields only; locked fields preserved. */
export default function LinkEdit() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { id = "" } = useParams();

  const [link, setLink] = useState<PaymentLinkV2 | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [requestError, setRequestError] = useState(false);
  const expectedUpdatedAt = useRef<string>("");

  const load = useCallback(() => {
    if (!user) return;
    setState("loading");
    setConflict(false);
    fetchLink(user.id, id)
      .then((l) => {
        if (!l) setState("unavailable");
        else {
          setLink(l);
          expectedUpdatedAt.current = l.updatedAt;
          setState("ready");
        }
      })
      .catch(() => setState("error"));
  }, [user, id]);

  useEffect(load, [load]);

  if (state === "loading") return <DetailSkeleton />;
  if (state === "error")
    return <ErrorNotice message={t("common.requestError")} retryLabel={t("common.retry")} onRetry={load} />;
  if (state === "unavailable" || !link)
    return (
      <div className="rounded-card border border-border bg-surface shadow-card">
        <EmptyState illustration="unavailable" title={t("common.unavailable")} body={t("common.unavailableBody")} />
      </div>
    );

  const used = link.orderCount > 0;
  const settled = link.type === "single-use" && link.lifecycle === "paid";

  const initial: LinkFormValues = {
    composition: link.composition,
    type: link.type,
    expiresAt: link.expiresAt ? link.expiresAt.slice(0, 16) : "",
    description: { ...link.description },
    lines: (link.productLines ?? link.productIds.map((pid) => ({ productId: pid, quantity: 1 }))).map((l) => ({ ...l })),
    amountStr: link.fixedAmount
      ? link.fixedAmount.amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
      : "",
  };

  const doSubmit = (values: LinkFormValues) => {
    setSubmitting(true);
    setRequestError(false);
    setConflict(false);
    updateLink(user!.id, link.id, expectedUpdatedAt.current, {
      title: { ...values.description },
      description: { ...values.description },
      expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null,
      // Composition values are only patched when still mutable (link unused).
      ...(used
        ? {}
        : {
            fixedAmount: link.composition === "fixed" ? toMoney(values, locale) : null,
            productIds: link.composition === "products" ? values.lines.map((l) => l.productId) : [],
            productLines: link.composition === "products" ? values.lines.map((l) => ({ ...l })) : [],
          }),
    })
      .then((res) => {
        setSubmitting(false);
        if (res.ok) {
          toast("success", t("links.edit.saved"));
          navigate(`/links/v2/${link.id}`);
        } else if (res.reason === "conflict") {
          setConflict(true);
        } else {
          setState("unavailable");
        }
      })
      .catch(() => {
        setSubmitting(false);
        setRequestError(true);
      });
  };

  return (
    <div className="space-y-4">
      <LinksBreadcrumb
        items={[
          { label: t("links.breadcrumb"), to: "/links" },
          { label: `#${link.identifier}`, to: `/links/v2/${link.id}`, mono: true },
          { label: t("links.new.editTitle") },
        ]}
      />
      <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-text">{t("links.new.editTitle")}</h1>

      {/* Editing-inappropriate banner → new version */}
      {(used || settled) && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-info bg-info-soft px-4 py-3 text-sm text-text">
          <GitBranch className="size-4 shrink-0 text-info" aria-hidden />
          <span className="min-w-0 flex-1">{t("links.edit.structuralBanner")}</span>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/links/new?from=${link.id}`)}>
            {t("links.edit.newVersionCta")}
          </Button>
        </div>
      )}

      {/* Concurrent-change conflict */}
      {conflict && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-danger bg-danger-soft px-4 py-3 text-sm text-text">
          <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden />
          <span className="min-w-0 flex-1">
            <strong className="font-medium">{t("links.edit.conflict.title")}</strong> — {t("links.edit.conflict.body")}
          </span>
          <Button variant="secondary" size="sm" onClick={load}>
            {t("links.edit.conflict.reload")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              // Retry: silently refresh the concurrency token, keep the user's edits.
              fetchLink(user!.id, id)
                .then((fresh) => {
                  if (fresh) expectedUpdatedAt.current = fresh.updatedAt;
                  setConflict(false);
                })
                .catch(() => setConflict(false));
            }}
          >
            {t("links.edit.conflict.retry")}
          </Button>
        </div>
      )}

      {requestError && (
        <div className="rounded-card border border-danger bg-danger-soft px-4 py-3 text-sm text-text">{t("links.edit.saveError")}</div>
      )}

      {/* Structural fields always locked in edit; composition values locked after use. */}
      <LinkForm
        key={`${link.id}-${link.updatedAt}`}
        initial={initial}
        lockStructural
        lockCompositionValues={used}
        submitting={submitting}
        submitLabel={t("links.edit.save")}
        onCancel={() => navigate(`/links/v2/${link.id}`)}
        onSubmit={doSubmit}
      />
    </div>
  );
}
