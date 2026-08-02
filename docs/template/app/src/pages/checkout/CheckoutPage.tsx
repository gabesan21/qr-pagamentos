import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2, RotateCcw, ShieldAlert } from "lucide-react";
import { useI18n } from "@/i18n";
import type { DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import type {
  CheckoutDataPolicy,
  LocalizedText,
  Money,
  PaymentLinkV1,
  PaymentLinkV2,
  ProviderState,
  User,
} from "@/mock/types";
import { PIX_PAYLOAD, checkoutDataPolicies, mockLatency, paymentLinks, paymentLinksV1, products, users } from "@/mock/fixtures";
import { Footer } from "@/components/Footer";
import { QRDisplay } from "@/components/ui/QRDisplay";
import { CopyField } from "@/components/ui/CopyField";
import { ProviderStateBadge } from "@/components/ui/StatusBadge";
import { MoneyText } from "@/components/ui/MoneyText";
import { Monogram } from "@/components/ui/Monogram";
import { Modal } from "@/components/ui/Modal";
import { CheckoutSkeleton } from "@/components/ui/Skeletons";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Mock resolution layer                                               */
/* ------------------------------------------------------------------ */

const IDENTIFIER_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

interface OrderLine {
  title: LocalizedText;
  qty: number;
  lineTotal: Money;
}

interface ResolvedLink {
  kind: "v1" | "v2";
  identifier: string;
  merchant: User;
  title: LocalizedText;
  description: LocalizedText;
  lines: OrderLine[] | null;
  total: Money;
  singleUse: boolean;
  expiresAt: string | null;
  policy: CheckoutDataPolicy;
}

function resolveV2(link: PaymentLinkV2, merchant: User): ResolvedLink | null {
  if (link.lifecycle !== "active") return null;
  const base = {
    kind: "v2" as const,
    identifier: link.identifier,
    merchant,
    title: link.title,
    description: link.description,
    singleUse: link.type === "single-use",
    expiresAt: link.expiresAt,
    policy: checkoutDataPolicies[merchant.id] ?? ("none" as CheckoutDataPolicy),
  };
  if (link.composition === "fixed" && link.fixedAmount) {
    return { ...base, lines: null, total: link.fixedAmount };
  }
  const lines: OrderLine[] = link.productIds
    .map((pid) => products.find((p) => p.id === pid && p.merchantId === link.merchantId && p.state === "active"))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({ title: p.title, qty: 1, lineTotal: p.price }));
  if (lines.length === 0) return null;
  const total: Money = { amount: lines.reduce((s, l) => s + l.lineTotal.amount * l.qty, 0), currency: "BRL" };
  return { ...base, lines, total };
}

function resolveV1(link: PaymentLinkV1, merchant: User): ResolvedLink | null {
  if (link.lifecycle !== "active") return null;
  return {
    kind: "v1",
    identifier: link.identifier,
    merchant,
    title: link.title,
    description: link.description,
    lines: null,
    total: link.price,
    singleUse: false,
    expiresAt: link.expiresAt,
    policy: checkoutDataPolicies[merchant.id] ?? ("none" as CheckoutDataPolicy),
  };
}

function resolveLink(identifier: string): ResolvedLink | null {
  if (!IDENTIFIER_RE.test(identifier)) return null;
  const v2 = paymentLinks.find((l) => l.identifier === identifier);
  if (v2) {
    const merchant = users.find((u) => u.id === v2.merchantId && u.state === "active");
    return merchant ? resolveV2(v2, merchant) : null;
  }
  const v1 = paymentLinksV1.find((l) => l.identifier === identifier);
  if (v1) {
    const merchant = users.find((u) => u.id === v1.merchantId && u.state === "active");
    return merchant ? resolveV1(v1, merchant) : null;
  }
  return null;
}

/** Mock quirk tables: deterministic demo coverage of failure states. */
const SUBMIT_FAILS_ONCE = new Set(["curso-barista"]); // first submission fails → safe retry banner
const POLL_HICCUP_AT: Record<string, number> = { "assinatura-mensal": 2 }; // poll step that fails once → manual retry
const STATUS_SEQUENCE: ProviderState[] = ["pending", "indeterminate", "confirmed"];

/* ------------------------------------------------------------------ */
/* Form helpers                                                        */
/* ------------------------------------------------------------------ */

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

function maskCPF(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function maskCEP(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.replace(/(\d{5})(\d)/, "$1-$2");
}

function isValidCPF(v: string): boolean {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (n: number) => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isValidCEP = (v: string) => /^\d{5}-\d{3}$/.test(v);

interface BuyerForm {
  name: string;
  email: string;
  cpf: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  complement: string;
}

const EMPTY_FORM: BuyerForm = {
  name: "", email: "", cpf: "", street: "", number: "",
  district: "", city: "", state: "", postalCode: "", complement: "",
};

type Errors = Partial<Record<keyof BuyerForm, DictKey>>;

function validate(form: BuyerForm, policy: CheckoutDataPolicy): Errors {
  const errors: Errors = {};
  if (policy === "none") return errors;
  if (!form.name.trim()) errors.name = "checkout.error.required";
  if (!form.email.trim()) errors.email = "checkout.error.required";
  else if (!isValidEmail(form.email)) errors.email = "checkout.error.email";
  if (policy === "nameEmail") return errors;
  if (!form.cpf.trim()) errors.cpf = "checkout.error.required";
  else if (!isValidCPF(form.cpf)) errors.cpf = "checkout.error.cpf";
  if (policy === "cpf") return errors;
  for (const k of ["street", "number", "district", "city"] as const) {
    if (!form[k].trim()) errors[k] = "checkout.error.required";
  }
  if (!form.state) errors.state = "checkout.error.required";
  if (!form.postalCode.trim()) errors.postalCode = "checkout.error.required";
  else if (!isValidCEP(form.postalCode)) errors.postalCode = "checkout.error.postalCode";
  return errors;
}

/* ------------------------------------------------------------------ */
/* Payment attempt mock                                                */
/* ------------------------------------------------------------------ */

interface Attempt {
  ref: string;
  qrPayload: string | null;
  state: ProviderState;
  pollFailed: boolean;
}

const TERMINAL_FAILURE: ProviderState[] = ["rejected", "cancelled", "expired"];
const TERMINAL_KEYS: Record<string, { title: DictKey; body: DictKey }> = {
  rejected: { title: "checkout.terminal.rejected.title", body: "checkout.terminal.rejected.body" },
  cancelled: { title: "checkout.terminal.cancelled.title", body: "checkout.terminal.cancelled.body" },
  expired: { title: "checkout.terminal.expired.title", body: "checkout.terminal.expired.body" },
};

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function Field({
  label,
  error,
  children,
  id,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-text-2">
        {label}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-xs text-danger" role="alert">
          <AlertTriangle className="size-3" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass = (invalid: boolean) =>
  cn(
    "h-10 w-full rounded-md border bg-surface px-3 text-[15px] leading-6 text-text placeholder:text-text-3 transition-colors focus:outline-none",
    invalid ? "border-danger" : "border-border focus:border-accent",
  );

function MerchantHeader({ link }: { link: ResolvedLink }) {
  const { t, locale } = useI18n();
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="rounded-full bg-accent p-1.5">
        <Monogram name={link.merchant.storefront.displayName[locale]} size={48} />
      </div>
      <h1 className="font-display text-lg font-semibold leading-[26px]">
        {link.merchant.storefront.displayName[locale]}
      </h1>
      <p className="text-xs text-text-3">{t("checkout.trustLine")}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

type Phase = "loading" | "unavailable" | "error" | "ready";

export default function CheckoutPage() {
  const { identifier = "" } = useParams();
  const { t, locale, formatMoney } = useI18n();
  const { setTheme } = useTheme();

  const [phase, setPhase] = useState<Phase>("loading");
  const [link, setLink] = useState<ResolvedLink | null>(null);
  const [form, setForm] = useState<BuyerForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const submitFailedOnce = useRef(false);
  const pollStep = useRef(0);
  const hiccupConsumed = useRef(false);
  const firstErrorRef = useRef<HTMLElement | null>(null);

  /* Phase 0 — resolve */
  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    (async () => {
      try {
        await mockLatency(600);
        if (cancelled) return;
        const resolved = resolveLink(identifier);
        if (resolved) {
          setLink(resolved);
          setTheme(resolved.merchant.storefront.theme);
          setPhase("ready");
        } else {
          setPhase("unavailable");
        }
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identifier, setTheme]);

  /* Expiration countdown ticker */
  useEffect(() => {
    if (!link?.expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [link?.expiresAt]);

  /* QR issuance delay (payment-data-pending) */
  useEffect(() => {
    if (!attempt || attempt.qrPayload !== null) return;
    const id = setTimeout(() => {
      setAttempt((a) => (a ? { ...a, qrPayload: `${PIX_PAYLOAD}${a.ref.slice(-4)}` } : a));
    }, 1400);
    return () => clearTimeout(id);
  }, [attempt]);

  /* Polling */
  useEffect(() => {
    if (!attempt || attempt.qrPayload === null || attempt.pollFailed) return;
    if (attempt.state === "confirmed" || attempt.state === "refunded" || TERMINAL_FAILURE.includes(attempt.state)) return;
    const id = setTimeout(() => {
      setAttempt((a) => {
        if (!a) return a;
        const hiccupAt = POLL_HICCUP_AT[identifier];
        if (!hiccupConsumed.current && hiccupAt !== undefined && pollStep.current === hiccupAt) {
          hiccupConsumed.current = true;
          return { ...a, pollFailed: true };
        }
        const next = STATUS_SEQUENCE[pollStep.current];
        pollStep.current += 1;
        return next ? { ...a, state: next } : a;
      });
    }, 2600);
    return () => clearTimeout(id);
  }, [attempt, identifier]);

  /* Link expiry mid-payment → expired terminal state */
  useEffect(() => {
    if (!link?.expiresAt || !attempt) return;
    if (Date.parse(link.expiresAt) <= now && !TERMINAL_FAILURE.includes(attempt.state) && attempt.state !== "confirmed") {
      setAttempt((a) => (a ? { ...a, state: "expired" } : a));
    }
  }, [now, link?.expiresAt, attempt]);

  const setField = useCallback((key: keyof BuyerForm, value: string) => {
    setForm((f) => ({ ...f, [key]: key === "cpf" ? maskCPF(value) : key === "postalCode" ? maskCEP(value) : value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }, []);

  const submit = useCallback(async () => {
    if (!link || submitting) return;
    const errs = validate(form, link.policy);
    setErrors(errs);
    const keys = Object.keys(errs) as (keyof BuyerForm)[];
    if (keys.length > 0) {
      const el = document.querySelector<HTMLElement>(`[data-field="${keys[0]}"]`);
      firstErrorRef.current = el;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    setSubmitError(false);
    try {
      await mockLatency(900);
      if (SUBMIT_FAILS_ONCE.has(link.identifier) && !submitFailedOnce.current) {
        submitFailedOnce.current = true;
        throw new Error("simulated submission failure");
      }
      pollStep.current = 0;
      hiccupConsumed.current = false;
      setAttempt({ ref: `pay_${Math.random().toString(36).slice(2, 10)}${link.identifier}`, qrPayload: null, state: "created", pollFailed: false });
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }, [link, submitting, form]);

  const newPayment = useCallback(() => {
    pollStep.current = 0;
    hiccupConsumed.current = false;
    setAttempt(null);
    setSubmitError(false);
  }, []);

  const retryPoll = useCallback(() => {
    setAttempt((a) => (a ? { ...a, pollFailed: false } : a));
  }, []);

  const expiresIn = useMemo(() => {
    if (!link?.expiresAt) return null;
    const ms = Date.parse(link.expiresAt) - now;
    if (ms <= 0) return { label: "0:00", soon: true };
    const totalMin = Math.floor(ms / 60_000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    const label =
      days > 0
        ? `${days}d ${hours}h`
        : hours > 0
          ? `${hours}h ${mins}min`
          : `${mins}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}min`;
    return { label, soon: ms < 10 * 60_000 };
  }, [link?.expiresAt, now]);

  const needsForm = link !== null && link.policy !== "none";
  const err = (k: keyof BuyerForm) => (errors[k] ? t(errors[k]!) : undefined);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center bg-bg px-4 py-8">
      <div className="flex w-full max-w-checkout flex-1 flex-col">
        <AnimatePresence mode="wait">
          {/* ------------------------- loading ------------------------- */}
          {phase === "loading" && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
              <CheckoutSkeleton />
            </motion.div>
          )}

          {/* ---------------------- general error ---------------------- */}
          {phase === "error" && (
            <motion.div key="error" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}
              className="rounded-card border border-danger bg-surface p-6 text-center shadow-card">
              <ShieldAlert className="mx-auto size-8 text-danger" aria-hidden />
              <p className="mt-3 text-sm text-text-2">{t("checkout.generalError")}</p>
              <button type="button" onClick={() => window.location.reload()}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-accent px-6 text-sm font-medium text-accent-fg transition-transform hover:-translate-y-px">
                <RotateCcw className="size-4" aria-hidden />
                {t("checkout.reload")}
              </button>
            </motion.div>
          )}

          {/* ----------------------- unavailable ----------------------- */}
          {phase === "unavailable" && (
            <motion.div key="unavailable" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}
              className="rounded-card border border-border bg-surface p-8 text-center shadow-card">
              <img src="/unavailable.svg" alt="" className="mx-auto size-40" />
              <h2 className="mt-4 font-display text-lg font-semibold">{t("checkout.unavailable.title")}</h2>
              <p className="mt-1 text-sm text-text-2">{t("checkout.unavailable.body")}</p>
            </motion.div>
          )}

          {/* -------------------------- ready -------------------------- */}
          {phase === "ready" && link && (
            <motion.div key={`ready-${attempt ? "pay" : "form"}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}
              className="flex flex-col gap-5">
              <MerchantHeader link={link} />

              {!attempt && (
                <>
                  {/* Order summary */}
                  <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
                    className="rounded-card border border-border bg-surface p-5 shadow-card">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-3">{t("checkout.orderSummary")}</h2>
                      {link.singleUse && (
                        <span className="rounded-pill bg-info-soft px-2.5 py-0.5 text-xs font-medium text-info">{t("checkout.singleUse")}</span>
                      )}
                    </div>
                    <h3 className="mt-3 font-display text-[15px] font-semibold leading-[22px]">{link.title[locale]}</h3>
                    <p className="mt-1 text-sm text-text-2">{link.description[locale]}</p>
                    {link.lines && (
                      <ul className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
                        {link.lines.map((l, i) => (
                          <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="text-text">{l.title[locale]}</span>
                            <span className="flex items-baseline gap-3">
                              <span className="font-money text-xs text-text-3">×{l.qty}</span>
                              <MoneyText money={l.lineTotal} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex items-baseline justify-between border-t-2 border-accent pt-3">
                      <span className="text-sm font-semibold">{t("checkout.total")}</span>
                      <MoneyText money={link.total} size="lg" showPair />
                    </div>
                    {expiresIn && (
                      <p className={cn("mt-3 text-xs", expiresIn.soon ? "text-warning" : "text-text-3")}>
                        {t("checkout.expiresIn", { time: expiresIn.label })}
                      </p>
                    )}
                  </motion.section>

                  {/* Buyer form + submit */}
                  <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                    className="rounded-card border border-border bg-surface p-5 shadow-card">
                    {needsForm && (
                      <fieldset disabled={submitting} className="flex flex-col gap-4">
                        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-3">{t("checkout.buyerData")}</h2>
                        <Field id="f-name" label={t("checkout.field.name")} error={err("name")}>
                          <input id="f-name" data-field="name" className={inputClass(!!errors.name)} value={form.name} onChange={(e) => setField("name", e.target.value)} autoComplete="name" />
                        </Field>
                        <Field id="f-email" label={t("checkout.field.email")} error={err("email")}>
                          <input id="f-email" data-field="email" type="email" className={inputClass(!!errors.email)} value={form.email} onChange={(e) => setField("email", e.target.value)} autoComplete="email" />
                        </Field>
                        {(link.policy === "cpf" || link.policy === "fullAddress") && (
                          <Field id="f-cpf" label={t("checkout.field.cpf")} error={err("cpf")}>
                            <input id="f-cpf" data-field="cpf" inputMode="numeric" placeholder="000.000.000-00" className={cn(inputClass(!!errors.cpf), "font-money")} value={form.cpf} onChange={(e) => setField("cpf", e.target.value)} />
                          </Field>
                        )}
                        {link.policy === "fullAddress" && (
                          <>
                            <div className="grid grid-cols-[1fr_110px] gap-3">
                              <Field id="f-street" label={t("checkout.field.street")} error={err("street")}>
                                <input id="f-street" data-field="street" className={inputClass(!!errors.street)} value={form.street} onChange={(e) => setField("street", e.target.value)} autoComplete="address-line1" />
                              </Field>
                              <Field id="f-number" label={t("checkout.field.number")} error={err("number")}>
                                <input id="f-number" data-field="number" className={inputClass(!!errors.number)} value={form.number} onChange={(e) => setField("number", e.target.value)} />
                              </Field>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <Field id="f-district" label={t("checkout.field.district")} error={err("district")}>
                                <input id="f-district" data-field="district" className={inputClass(!!errors.district)} value={form.district} onChange={(e) => setField("district", e.target.value)} autoComplete="address-line2" />
                              </Field>
                              <Field id="f-city" label={t("checkout.field.city")} error={err("city")}>
                                <input id="f-city" data-field="city" className={inputClass(!!errors.city)} value={form.city} onChange={(e) => setField("city", e.target.value)} autoComplete="address-level2" />
                              </Field>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <Field id="f-state" label={t("checkout.field.state")} error={err("state")}>
                                <select id="f-state" data-field="state" className={inputClass(!!errors.state)} value={form.state} onChange={(e) => setField("state", e.target.value)}>
                                  <option value="">{t("checkout.field.statePlaceholder")}</option>
                                  {UFS.map((uf) => (
                                    <option key={uf} value={uf}>{uf}</option>
                                  ))}
                                </select>
                              </Field>
                              <Field id="f-postal" label={t("checkout.field.postalCode")} error={err("postalCode")}>
                                <input id="f-postal" data-field="postalCode" inputMode="numeric" placeholder="00000-000" className={cn(inputClass(!!errors.postalCode), "font-money")} value={form.postalCode} onChange={(e) => setField("postalCode", e.target.value)} autoComplete="postal-code" />
                              </Field>
                            </div>
                            <Field id="f-complement" label={t("checkout.field.complement")}>
                              <input id="f-complement" className={inputClass(false)} value={form.complement} onChange={(e) => setField("complement", e.target.value)} />
                            </Field>
                          </>
                        )}
                      </fieldset>
                    )}

                    {submitError && (
                      <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-danger bg-danger-soft px-3 py-2.5" role="alert">
                        <span className="text-xs font-medium text-danger">{t("checkout.submitError")}</span>
                        <span className="text-xs font-semibold text-danger">{t("checkout.tryAgain")}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => void submit()}
                      disabled={submitting}
                      className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-accent text-base font-medium text-accent-fg transition-all hover:-translate-y-px active:scale-[0.98] disabled:translate-y-0 disabled:opacity-50"
                    >
                      {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
                      {submitting ? t("checkout.submitting") : t("checkout.pay", { total: formatMoney(link.total.amount, link.total.currency) })}
                    </button>

                    <p className="mt-3 text-center text-xs text-text-3">
                      {t("checkout.privacyLine")}{" "}
                      <button type="button" onClick={() => setPrivacyOpen(true)} className="underline underline-offset-2 hover:text-text-2">
                        {t("checkout.privacy")}
                      </button>
                    </p>
                  </motion.section>
                </>
              )}

              {attempt && (
                <PaymentPhase attempt={attempt} link={link} form={form} expiresIn={expiresIn} onNewPayment={newPayment} onRetryPoll={retryPoll} />
              )}

              <Modal open={privacyOpen} onClose={() => setPrivacyOpen(false)} title={t("checkout.privacyModal.title")} width={560}>
                {t("checkout.privacyModal.body").split("\n\n").map((p, i) => (
                  <p key={i} className="mb-3 text-sm leading-6 text-text-2 last:mb-0">{p}</p>
                ))}
              </Modal>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="mt-8 w-full max-w-checkout rounded-card border border-border bg-surface shadow-card">
        <Footer />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Phase 2 — payment                                                   */
/* ------------------------------------------------------------------ */

function PaymentPhase({
  attempt,
  link,
  form,
  expiresIn,
  onNewPayment,
  onRetryPoll,
}: {
  attempt: Attempt;
  link: ResolvedLink;
  form: BuyerForm;
  expiresIn: { label: string; soon: boolean } | null;
  onNewPayment: () => void;
  onRetryPoll: () => void;
}) {
  const { t, locale } = useI18n();
  const pending = attempt.state === "created" || attempt.state === "pending" || attempt.state === "indeterminate";
  const merchantName = link.merchant.storefront.displayName[locale];

  /* ---- success view ---- */
  if (attempt.state === "confirmed") {
    return (
      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="rounded-card border border-border bg-surface p-6 text-center shadow-card">
        <motion.img src="/checkout-success.svg" alt="" className="mx-auto size-36"
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} />
        <h2 className="mt-3 font-display text-lg font-semibold text-success">{t("checkout.success.title")}</h2>
        <p className="mt-1 text-sm text-text-2">{t("checkout.success.body")}</p>
        <div className="mt-5 flex flex-col items-center gap-2 rounded-md border border-border bg-surface-2 p-4">
          <MoneyText money={link.total} size="lg" showPair />
          <div className="mt-1 flex items-center gap-2 text-xs text-text-3">
            <span>{t("checkout.orderReference")}</span>
            <CopyField value={attempt.ref} truncate={false} />
          </div>
          {form.name && (
            <p className="text-xs text-text-3">
              {t("checkout.paidBy")}: <span className="text-text-2">{form.name}</span>
            </p>
          )}
          <p className="text-xs text-text-3">
            {t("checkout.merchant")}: <span className="text-text-2">{merchantName}</span>
          </p>
        </div>
      </motion.section>
    );
  }

  /* ---- refunded (neutral info) ---- */
  if (attempt.state === "refunded") {
    return (
      <section className="rounded-card border border-border bg-surface p-6 text-center shadow-card">
        <div className="flex justify-center">
          <ProviderStateBadge state="refunded" />
        </div>
        <h2 className="mt-3 font-display text-lg font-semibold">{t("checkout.refunded.title")}</h2>
        <p className="mt-1 text-sm text-text-2">{t("checkout.refunded.body")}</p>
      </section>
    );
  }

  /* ---- terminal failure (rejected / cancelled / expired) ---- */
  if (TERMINAL_FAILURE.includes(attempt.state)) {
    const keys = TERMINAL_KEYS[attempt.state]!;
    return (
      <section className="rounded-card border border-border bg-surface p-6 text-center shadow-card">
        <img src="/unavailable.svg" alt="" className="mx-auto size-32 opacity-80" />
        <div className="mt-2 flex justify-center">
          <ProviderStateBadge state={attempt.state} />
        </div>
        <h2 className="mt-3 font-display text-lg font-semibold">{t(keys.title)}</h2>
        <p className="mt-1 text-sm text-text-2">{t(keys.body)}</p>
        <button type="button" onClick={onNewPayment}
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-accent px-6 text-sm font-medium text-accent-fg transition-transform hover:-translate-y-px active:scale-[0.98]">
          {t("checkout.newPayment")}
        </button>
      </section>
    );
  }

  /* ---- live payment (created / pending / indeterminate) ---- */
  return (
    <section className="rounded-card border border-border bg-surface p-6 shadow-card">
      <div className="flex justify-center">
        <AnimatePresence mode="wait">
          <motion.span key={attempt.state} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <ProviderStateBadge state={attempt.state} />
          </motion.span>
        </AnimatePresence>
      </div>

      {attempt.pollFailed && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-warning bg-warning-soft px-3 py-2.5" role="alert">
          <span className="flex items-center gap-1.5 text-xs font-medium text-warning">
            <AlertTriangle className="size-3.5" aria-hidden />
            {t("checkout.pollError")}
          </span>
          <button type="button" onClick={onRetryPoll} className="text-xs font-semibold text-warning underline underline-offset-2">
            {t("checkout.checkAgain")}
          </button>
        </div>
      )}

      {attempt.state === "indeterminate" && (
        <p className="mt-3 text-center text-xs text-warning">{t("checkout.confirmingBank")}</p>
      )}

      <div className="mt-4">
        {attempt.qrPayload === null ? (
          <div className="flex flex-col items-center gap-3">
            <div className="skeleton-shimmer size-[264px] rounded-card" role="status" aria-busy />
            <p className="flex items-center gap-2 text-sm text-text-2">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t("checkout.generatingQr")}
            </p>
          </div>
        ) : (
          <QRDisplay payload={attempt.qrPayload} merchantName={merchantName} caption={t("checkout.scanCaption")} pending={pending} />
        )}
      </div>

      <div className="mt-5 flex items-baseline justify-between border-t border-border pt-4">
        <span className="text-sm text-text-2">{t("checkout.amountDue")}</span>
        <MoneyText money={link.total} size="lg" showPair />
      </div>
      {expiresIn && (
        <p className={cn("mt-2 text-center text-xs", expiresIn.soon ? "text-warning" : "text-text-3")}>
          {t("checkout.expiresIn", { time: expiresIn.label })}
        </p>
      )}
    </section>
  );
}
