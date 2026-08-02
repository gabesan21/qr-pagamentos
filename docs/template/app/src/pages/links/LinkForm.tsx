import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, Minus, Plus, Search, Trash2, X } from "lucide-react";
import { useI18n } from "@/i18n";
import { useSession } from "@/mock/session";
import type { LocalizedText, Money, Product } from "@/mock/types";
import { Button } from "@/components/ui/button";
import { LocalizedFieldGroup } from "@/components/ui/LocalizedFieldGroup";
import { MoneyText } from "@/components/ui/MoneyText";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { fetchEligibleProducts } from "./linkStore";
import { PairChip, SectionCard, formCls } from "./shared";

export interface LinkFormValues {
  composition: "products" | "fixed";
  type: "reusable" | "single-use";
  expiresAt: string; // datetime-local value or ""
  description: LocalizedText;
  lines: Array<{ productId: string; quantity: number }>;
  amountStr: string;
}

export const emptyValues: LinkFormValues = {
  composition: "fixed",
  type: "reusable",
  expiresAt: "",
  description: { "pt-BR": "", en: "" },
  lines: [],
  amountStr: "",
};

/** Locale-aware exact-decimal parse: accepts "1.234,56" / "1,234.56" / "42.9". */
export function parseAmount(input: string, locale: string): number | null {
  const s = input.trim();
  if (!s) return null;
  let normalized: string;
  if (locale === "pt-BR") {
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    if (!/^\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(s)) return null;
    normalized = s.replace(/,/g, "");
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function validate(values: LinkFormValues, locale: string): Partial<Record<"description" | "amount" | "products", string>> {
  const errors: Partial<Record<"description" | "amount" | "products", string>> = {};
  if (!values.description["pt-BR"].trim() && !values.description.en.trim()) errors.description = "links.new.descRequired";
  if (values.composition === "fixed" && parseAmount(values.amountStr, locale) === null) errors.amount = "links.new.amountInvalid";
  if (values.composition === "products" && values.lines.length === 0) errors.products = "links.new.productsRequired";
  return errors;
}

export function toMoney(values: LinkFormValues, locale: string): Money | null {
  const n = parseAmount(values.amountStr, locale);
  return n === null ? null : { amount: n, currency: "BRL" };
}

export function linesTotal(lines: LinkFormValues["lines"], products: Product[]): number {
  return lines.reduce((sum, l) => {
    const p = products.find((pr) => pr.id === l.productId);
    return sum + (p ? p.price.amount * l.quantity : 0);
  }, 0);
}

function LockedNote({ label }: { label: string }) {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="mt-1.5 flex items-center gap-1.5 text-xs text-text-3"
    >
      <Lock className="size-3" aria-hidden /> {label}
    </motion.p>
  );
}

export function LinkForm({
  initial,
  lockStructural = false,
  lockCompositionValues = false,
  submitting = false,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: LinkFormValues;
  /** Lock type / currency / composition kind (immutable-after-use fields). */
  lockStructural?: boolean;
  /** Lock composition values (amount / product lines). */
  lockCompositionValues?: boolean;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (values: LinkFormValues) => void;
  onCancel: () => void;
}) {
  const { t, locale, formatMoney } = useI18n();
  const { user } = useSession();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [values, setValues] = useState<LinkFormValues>(initial);
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
  const [products, setProducts] = useState<Product[] | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");

  useEffect(() => {
    if (user) fetchEligibleProducts(user.id).then(setProducts).catch(() => setProducts([]));
  }, [user]);

  const set = <K extends keyof LinkFormValues>(k: K, v: LinkFormValues[K]) => {
    setValues((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => ({ ...prev, description: undefined, amount: undefined, products: undefined }));
  };

  // Unavailable dependency: no active currency pair (mock rule: storefront connection disabled).
  const noPairs = !(user?.storefront.enabled ?? false);
  const eligible = products ?? [];
  const structuralLocked = lockStructural || noPairs;
  const compValuesLocked = lockCompositionValues || noPairs;
  const selectedIds = new Set(values.lines.map((l) => l.productId));
  const pickerResults = eligible.filter(
    (p) =>
      !selectedIds.has(p.id) &&
      (p.title[locale].toLowerCase().includes(pickerQuery.toLowerCase()) ||
        p.title["pt-BR"].toLowerCase().includes(pickerQuery.toLowerCase())),
  );

  const total = useMemo(() => linesTotal(values.lines, eligible), [values.lines, eligible]);

  const submit = () => {
    const errs = validate(values, locale);
    setErrors(errs);
    if (Object.keys(errs).length === 0) onSubmit(values);
  };

  const radioCard = (active: boolean, locked: boolean) =>
    cn(
      "flex-1 rounded-card border p-4 text-left transition-colors",
      active ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-text-3",
      locked && "pointer-events-none opacity-60",
    );

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {/* Form column */}
      <div className="space-y-4 lg:col-span-8">
        {/* 1. Composition */}
        <SectionCard title={t("links.new.section.composition")} index={0}>
          <div className="flex flex-col gap-3 sm:flex-row" role="radiogroup" aria-label={t("links.new.section.composition")}>
            <button type="button" disabled={structuralLocked} onClick={() => set("composition", "products")} className={radioCard(values.composition === "products", structuralLocked)}>
              <p className="text-sm font-medium text-text">{t("links.comp.products")}</p>
              <p className="mt-1 text-xs text-text-2">{t("links.new.compProductsCaption")}</p>
            </button>
            <button type="button" disabled={structuralLocked} onClick={() => set("composition", "fixed")} className={radioCard(values.composition === "fixed", structuralLocked)}>
              <p className="text-sm font-medium text-text">{t("links.comp.fixed")}</p>
              <p className="mt-1 text-xs text-text-2">{t("links.new.compFixedCaption")}</p>
            </button>
          </div>
          {lockStructural && <LockedNote label={t("links.new.lockedAfterUse")} />}
        </SectionCard>

        {/* 2. Currency */}
        <SectionCard title={t("links.new.section.currency")} index={1}>
          {noPairs ? (
            <div className="rounded-card border border-warning bg-warning-soft p-4">
              <p className="text-sm font-medium text-text">{t("links.new.currencyNone.title")}</p>
              <p className="mt-1 text-xs text-text-2">{t("links.new.currencyNone.body")}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => navigate("/settings")}>
                {t("links.new.currencyNone.cta")}
              </Button>
            </div>
          ) : (
            <div>
              <label className={formCls.label} htmlFor="lf-currency">{t("links.new.currencyLabel")}</label>
              <div className="mt-1.5 flex items-center gap-2">
                <select id="lf-currency" disabled className={formCls.input + " w-auto"} value="BRL_PIX">
                  <option value="BRL_PIX">BRL / PIX</option>
                </select>
                <PairChip />
              </div>
              {lockStructural && <LockedNote label={t("links.new.lockedAfterUse")} />}
            </div>
          )}
        </SectionCard>

        {/* 3. Type */}
        <SectionCard title={t("links.new.section.type")} index={2}>
          <div className="flex flex-col gap-3 sm:flex-row" role="radiogroup" aria-label={t("links.new.section.type")}>
            <button type="button" disabled={structuralLocked} onClick={() => set("type", "reusable")} className={radioCard(values.type === "reusable", structuralLocked)}>
              <p className="text-sm font-medium text-text">{t("links.type.reusable")}</p>
              <p className="mt-1 text-xs text-text-2">{t("links.new.typeReusableCaption")}</p>
            </button>
            <button type="button" disabled={structuralLocked} onClick={() => set("type", "single-use")} className={radioCard(values.type === "single-use", structuralLocked)}>
              <p className="text-sm font-medium text-text">{t("links.type.singleUse")}</p>
              <p className="mt-1 text-xs text-text-2">{t("links.new.typeSingleCaption")}</p>
            </button>
          </div>
          {lockStructural && <LockedNote label={t("links.new.lockedAfterUse")} />}
        </SectionCard>

        {/* 4. Expiration */}
        <SectionCard title={t("links.new.section.expiration")} index={3}>
          <label className={formCls.label} htmlFor="lf-exp">{t("links.new.expirationLabel")}</label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id="lf-exp"
              type="datetime-local"
              value={values.expiresAt}
              onChange={(e) => set("expiresAt", e.target.value)}
              className={formCls.input + " w-auto"}
            />
            {values.expiresAt && (
              <Button variant="ghost" size="sm" onClick={() => set("expiresAt", "")}>
                <X aria-hidden /> {t("links.new.expirationClear")}
              </Button>
            )}
          </div>
        </SectionCard>

        {/* 5. Descriptions */}
        <SectionCard title={t("links.new.section.descriptions")} index={4}>
          <LocalizedFieldGroup
            id="lf-desc"
            label={t("links.new.section.descriptions")}
            value={values.description}
            onChange={(v) => set("description", v)}
            multiline
            required
          />
          {errors.description && <p className="mt-1.5 text-xs text-danger">{t(errors.description as Parameters<typeof t>[0])}</p>}
        </SectionCard>

        {/* 6/7. Composition values — crossfade swap */}
        <AnimatePresence mode="wait" initial={false}>
          {values.composition === "products" ? (
            <motion.div key="products" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <SectionCard title={t("links.new.section.products")} index={5}>
                {products === null ? (
                  <p className="text-sm text-text-3">{t("common.loading")}</p>
                ) : eligible.length === 0 ? (
                  <div className="rounded-card border border-warning bg-warning-soft p-4">
                    <p className="text-sm font-medium text-text">{t("links.new.noProducts.title")}</p>
                    <p className="mt-1 text-xs text-text-2">{t("links.new.noProducts.body")}</p>
                    <Button variant="secondary" size="sm" className="mt-3" onClick={() => navigate("/catalog/products/new")}>
                      {t("links.new.noProducts.cta")}
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Selected lines */}
                    <ul className="space-y-2">
                      {values.lines.map((line) => {
                        const p = eligible.find((pr) => pr.id === line.productId);
                        if (!p) return null;
                        return (
                          <li key={line.productId} className="flex flex-wrap items-center gap-3 rounded-card border border-border p-3">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{p.title[locale] || p.title["pt-BR"]}</span>
                            <span className="flex items-center gap-1" aria-label={t("links.new.qty")}>
                              <button type="button" disabled={compValuesLocked} aria-label="-" className="size-7 rounded-md border border-border text-text-2 disabled:opacity-50" onClick={() => set("lines", values.lines.map((l) => (l.productId === line.productId ? { ...l, quantity: Math.max(1, l.quantity - 1) } : l)))}>
                                <Minus className="mx-auto size-3.5" aria-hidden />
                              </button>
                              <span className="w-8 text-center font-money text-sm text-text">{line.quantity}</span>
                              <button type="button" disabled={compValuesLocked} aria-label="+" className="size-7 rounded-md border border-border text-text-2 disabled:opacity-50" onClick={() => set("lines", values.lines.map((l) => (l.productId === line.productId ? { ...l, quantity: l.quantity + 1 } : l)))}>
                                <Plus className="mx-auto size-3.5" aria-hidden />
                              </button>
                            </span>
                            <span className="w-24 text-right">
                              <span className="block text-[11px] text-text-3">{t("links.new.unitPrice")}</span>
                              <MoneyText money={p.price} />
                            </span>
                            <span className="w-24 text-right">
                              <span className="block text-[11px] text-text-3">{t("links.new.lineTotal")}</span>
                              <MoneyText money={{ amount: Math.round(p.price.amount * line.quantity * 100) / 100, currency: "BRL" }} />
                            </span>
                            <button type="button" disabled={compValuesLocked} aria-label={t("links.new.remove")} className="rounded-md p-1.5 text-text-3 hover:text-danger disabled:opacity-50" onClick={() => set("lines", values.lines.filter((l) => l.productId !== line.productId))}>
                              <Trash2 className="size-4" aria-hidden />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {errors.products && <p className="mt-1.5 text-xs text-danger">{t(errors.products as Parameters<typeof t>[0])}</p>}
                    {compValuesLocked && values.lines.length > 0 && <LockedNote label={t("links.new.lockedAfterUse")} />}

                    {/* Picker */}
                    {!compValuesLocked && pickerResults.length > 0 && (
                      <div className="mt-3 rounded-card border border-dashed border-border p-3">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" aria-hidden />
                          <input
                            value={pickerQuery}
                            onChange={(e) => setPickerQuery(e.target.value)}
                            placeholder={t("links.new.productSearch")}
                            aria-label={t("links.new.productSearch")}
                            className={formCls.input + " pl-9"}
                          />
                        </div>
                        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                          {pickerResults.slice(0, 6).map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-2"
                                onClick={() => {
                                  if (selectedIds.has(p.id)) {
                                    toast("info", t("links.new.alreadyAdded"));
                                    return;
                                  }
                                  set("lines", [...values.lines, { productId: p.id, quantity: 1 }]);
                                }}
                              >
                                <span className="min-w-0 flex-1 truncate text-sm text-text">{p.title[locale] || p.title["pt-BR"]}</span>
                                <MoneyText money={p.price} />
                                <Plus className="size-4 text-accent" aria-hidden />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Running total */}
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                      <span className={formCls.label}>{t("links.new.total")}</span>
                      <MoneyText money={{ amount: Math.round(total * 100) / 100, currency: "BRL" }} size="lg" showPair />
                    </div>
                  </>
                )}
              </SectionCard>
            </motion.div>
          ) : (
            <motion.div key="fixed" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <SectionCard title={t("links.new.section.amount")} index={5}>
                <label className={formCls.label} htmlFor="lf-amount">{t("links.new.amountLabel")}</label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="lf-amount"
                    inputMode="decimal"
                    value={values.amountStr}
                    disabled={compValuesLocked}
                    onChange={(e) => set("amountStr", e.target.value)}
                    placeholder={locale === "pt-BR" ? "0,00" : "0.00"}
                    aria-invalid={Boolean(errors.amount)}
                    className={cn(formCls.input, "w-48 font-money", errors.amount && "border-danger")}
                  />
                  <PairChip />
                </div>
                {errors.amount && <p className="mt-1.5 text-xs text-danger">{t(errors.amount as Parameters<typeof t>[0])}</p>}
                {compValuesLocked && <LockedNote label={t("links.new.lockedAfterUse")} />}
              </SectionCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={submitting || noPairs}>
            {submitting ? t("common.loading") : submitLabel}
          </Button>
        </div>
      </div>

      {/* Live summary preview */}
      <div className="lg:col-span-4">
        <div className="lg:sticky lg:top-20">
          <SectionCard title={t("links.new.preview.title")} index={2}>
            {(() => {
              const money = values.composition === "fixed" ? toMoney(values, locale) : null;
              const amount = values.composition === "fixed" ? money?.amount ?? null : total;
              const hasContent = amount !== null || values.description["pt-BR"].trim() || values.description.en.trim();
              if (!hasContent) return <p className="text-sm text-text-3">{t("links.new.preview.empty")}</p>;
              return (
                <dl className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-text-3">{t("links.new.preview.type")}</dt>
                    <dd className="text-text">{t(values.type === "reusable" ? "links.type.reusable" : "links.type.singleUse")}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-text-3">{t("links.new.preview.composition")}</dt>
                    <dd className="text-text">{t(values.composition === "products" ? "links.comp.products" : "links.comp.fixed")}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-text-3">{t("links.new.preview.currency")}</dt>
                    <dd><PairChip /></dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-text-3">{t("links.new.preview.expiration")}</dt>
                    <dd className="text-text">{values.expiresAt ? new Date(values.expiresAt).toLocaleString(locale) : t("links.noExpiration")}</dd>
                  </div>
                  {values.composition === "products" && (
                    <div className="flex items-center justify-between">
                      <dt className="text-text-3">{t("links.new.preview.lines")}</dt>
                      <dd className="font-money text-text">{values.lines.reduce((n, l) => n + l.quantity, 0)}</dd>
                    </div>
                  )}
                  <div className="border-t border-border pt-3">
                    <dt className="text-text-3">{t("links.new.preview.amount")}</dt>
                    <dd className="mt-1">
                      {amount !== null ? (
                        <motion.span key={amount} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}>
                          <MoneyText money={{ amount: Math.round(amount * 100) / 100, currency: "BRL" }} size="lg" showPair />
                        </motion.span>
                      ) : (
                        <span className="text-sm text-text-3">— {formatMoney(0, "BRL")}</span>
                      )}
                    </dd>
                  </div>
                </dl>
              );
            })()}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
