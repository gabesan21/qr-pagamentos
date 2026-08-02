import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { GitBranch } from "lucide-react";
import { useI18n } from "@/i18n";
import { useSession } from "@/mock/session";
import type { PaymentLinkV2 } from "@/mock/types";
import { useToast } from "@/components/ui/Toast";
import { createLink, fetchLink } from "./linkStore";
import { LinkForm, emptyValues, toMoney, validate } from "./LinkForm";
import type { LinkFormValues } from "./LinkForm";
import { LinksBreadcrumb, ErrorNotice } from "./shared";

/** `/links/new` — create Commerce V2 link; `?from=[id]` = new version based on an existing link. */
export default function LinkCreate() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromId = params.get("from");

  const [source, setSource] = useState<PaymentLinkV2 | null>(null);
  const [sourceState, setSourceState] = useState<"idle" | "loading" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState(false);

  useEffect(() => {
    if (!fromId || !user) return;
    setSourceState("loading");
    fetchLink(user.id, fromId)
      .then((l) => {
        setSource(l);
        setSourceState("idle");
      })
      .catch(() => setSourceState("error"));
  }, [fromId, user]);

  if (!user) return null;

  const initial: LinkFormValues = source
    ? {
        composition: source.composition,
        type: source.type,
        expiresAt: "",
        description: { ...source.description },
        lines: (source.productLines ?? source.productIds.map((id) => ({ productId: id, quantity: 1 }))).map((l) => ({ ...l })),
        amountStr: source.fixedAmount
          ? source.fixedAmount.amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
          : "",
      }
    : emptyValues;

  const doSubmit = (values: LinkFormValues) => {
    setSubmitting(true);
    setRequestError(false);
    createLink({
      merchantId: user.id,
      merchantUsername: user.username,
      type: values.type,
      composition: values.composition,
      description: values.description,
      fixedAmount: toMoney(values, "pt-BR") ?? toMoney(values, "en"),
      lines: values.lines,
      expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null,
    })
      .then((link) => {
        toast("success", t("links.new.success"));
        navigate(`/links/v2/${link.id}`);
      })
      .catch(() => {
        setRequestError(true);
        setSubmitting(false);
      });
  };

  return (
    <div className="space-y-4">
      <LinksBreadcrumb
        items={[{ label: t("links.breadcrumb"), to: "/links" }, { label: t("links.new.title") }]}
      />
      <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-text">{t("links.new.title")}</h1>

      {fromId && sourceState !== "error" && source && (
        <div className="flex items-center gap-2 rounded-card border border-info bg-info-soft px-4 py-3 text-sm text-text">
          <GitBranch className="size-4 text-info" aria-hidden />
          {t("links.new.bannerNewVersion", { id: source.identifier })}
        </div>
      )}
      {sourceState === "error" && (
        <ErrorNotice
          message={t("common.requestError")}
          retryLabel={t("common.retry")}
          onRetry={() => setSourceState("loading")}
        />
      )}

      {requestError && (
        <div className="flex items-center justify-between rounded-card border border-danger bg-danger-soft px-4 py-3 text-sm text-text">
          <span>{t("links.new.error")}</span>
          <button type="button" className="text-xs font-medium text-danger hover:underline" onClick={() => setRequestError(false)}>
            {t("common.retry")}
          </button>
        </div>
      )}

      {/* New-version mode: structural fields (type/currency/composition) pre-filled and locked. */}
      <LinkForm
        key={source?.id ?? "fresh"}
        initial={initial}
        lockStructural={source !== null}
        submitting={submitting}
        submitLabel={t("links.new.submit")}
        onCancel={() => navigate(source ? `/links/v2/${source.id}` : "/links")}
        onSubmit={(values) => {
          const errs = validate(values, "pt-BR");
          if (Object.keys(errs).length === 0) doSubmit(values);
        }}
      />
    </div>
  );
}
