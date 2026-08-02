import { useMemo } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { useI18n } from "@/i18n";
import type { DictKey } from "@/i18n";
import type { Category, CurrencyMapping, LocalizedText, Product } from "@/mock/types";
import { LocalizedFieldGroup } from "@/components/ui/LocalizedFieldGroup";
import { MoneyText } from "@/components/ui/MoneyText";
import { Banner, Field, ImageField, NativeSelect, SegmentedControl, inputCls } from "./fields";

export interface ProductFormValue {
  internalName: string;
  title: LocalizedText;
  description: LocalizedText;
  price: string;
  currency: string;
  categoryId: string;
  state: "active" | "inactive";
  imageUrl: string | null;
}

export interface ProductFormErrors {
  internalName?: string;
  title?: string;
  price?: string;
}

export function validateProduct(v: ProductFormValue, takenNames: string[], t: (k: DictKey) => string): ProductFormErrors {
  const e: ProductFormErrors = {};
  if (!v.internalName.trim()) e.internalName = t("catalog.err.required");
  else if (takenNames.includes(v.internalName.trim().toLowerCase())) e.internalName = t("catalog.err.internalNameTaken");
  if (!v.title["pt-BR"].trim() || !v.title.en.trim()) e.title = t("catalog.err.titleRequired");
  const n = Number(v.price.replace(",", "."));
  if (!v.price.trim() || !Number.isFinite(n) || n <= 0 || !/^\d+([.,]\d{1,2})?$/.test(v.price.trim()))
    e.price = t("catalog.err.priceInvalid");
  return e;
}

export function parsePrice(v: string): number {
  return Math.round(Number(v.replace(",", ".")) * 100) / 100;
}

/** Field set shared by product create + edit, plus sticky preview card. */
export function ProductForm({
  value,
  onChange,
  errors,
  categories,
  currencies,
  readOnly = false,
  showInternalName = true,
}: {
  value: ProductFormValue;
  onChange: (v: ProductFormValue) => void;
  errors: ProductFormErrors;
  categories: Category[];
  currencies: CurrencyMapping[];
  readOnly?: boolean;
  showInternalName?: boolean;
}) {
  const { t, locale } = useI18n();
  const activeCats = useMemo(() => categories.filter((c) => c.state === "active"), [categories]);
  const activeCurrencies = useMemo(() => currencies.filter((c) => c.active), [currencies]);
  const set = (patch: Partial<ProductFormValue>) => onChange({ ...value, ...patch });

  const priceNum = /^\d+([.,]\d{1,2})?$/.test(value.price.trim()) ? parsePrice(value.price) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="space-y-5 lg:col-span-8">
        {showInternalName && (
          <Field label={t("catalog.form.internalName")} htmlFor="p-internal" error={errors.internalName} helper={t("catalog.form.internalNameHelp")}>
            <input
              id="p-internal"
              className={inputCls}
              value={value.internalName}
              disabled={readOnly}
              onChange={(e) => set({ internalName: e.target.value })}
            />
          </Field>
        )}

        <div>
          <LocalizedFieldGroup
            id="p-title"
            label={t("catalog.form.titles")}
            value={value.title}
            onChange={(title) => !readOnly && set({ title })}
            required
          />
          {errors.title && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
              {errors.title}
            </p>
          )}
        </div>

        <LocalizedFieldGroup
          id="p-desc"
          label={t("catalog.form.descriptions")}
          value={value.description}
          onChange={(description) => !readOnly && set({ description })}
          multiline
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("catalog.form.price")} htmlFor="p-price" error={errors.price}>
            <input
              id="p-price"
              className={`${inputCls} font-money`}
              inputMode="decimal"
              placeholder="0.00"
              value={value.price}
              disabled={readOnly}
              onChange={(e) => set({ price: e.target.value })}
            />
          </Field>
          <Field label={t("catalog.form.currency")} htmlFor="p-currency" optional>
            <NativeSelect
              id="p-currency"
              value={value.currency}
              onChange={(currency) => set({ currency })}
              disabled={readOnly || activeCurrencies.length === 0}
              options={[
                { value: "", label: t("catalog.form.noCurrencyOption") },
                ...activeCurrencies.map((c) => ({ value: c.code, label: c.code })),
              ]}
            />
          </Field>
        </div>

        {activeCurrencies.length === 0 && (
          <Banner tone="warning">
            <p className="font-medium">{t("catalog.noCurrency.title")}</p>
            <p className="mt-0.5">
              {t("catalog.noCurrency.body")}{" "}
              <Link to="/settings" className="font-medium underline">
                {t("settings.title")}
              </Link>
            </p>
          </Banner>
        )}

        <Field label={t("catalog.form.category")} htmlFor="p-category" optional>
          <NativeSelect
            id="p-category"
            value={value.categoryId}
            onChange={(categoryId) => set({ categoryId })}
            disabled={readOnly || activeCats.length === 0}
            options={[
              { value: "", label: t("catalog.form.noCategoryOption") },
              ...activeCats.map((c) => ({ value: c.id, label: c.name[locale] })),
            ]}
          />
        </Field>

        {activeCats.length === 0 && (
          <Banner tone="info">
            {t("catalog.noCategory.body")}{" "}
            <Link to="/catalog/categories" className="font-medium underline">
              {t("catalog.manageCategories")}
            </Link>
          </Banner>
        )}

        {!readOnly && (
          <Field label={t("catalog.form.state")}>
            <SegmentedControl
              ariaLabel={t("catalog.form.state")}
              value={value.state}
              onChange={(s) => set({ state: s as "active" | "inactive" })}
              options={[
                { value: "active", label: t("status.active") },
                { value: "inactive", label: t("status.inactive") },
              ]}
            />
          </Field>
        )}

        <Field label={t("catalog.form.image")} optional>
          <ImageField value={value.imageUrl} onChange={(imageUrl) => set({ imageUrl })} disabled={readOnly} />
        </Field>
      </div>

      {/* Sticky preview */}
      <div className="lg:col-span-4">
        <motion.div
          layout="position"
          transition={{ duration: 0.12 }}
          className="rounded-card border border-border bg-surface p-5 shadow-card lg:sticky lg:top-20"
        >
          <h3 className="font-display text-[15px] font-semibold text-text">{t("catalog.preview.title")}</h3>
          <div className="mt-4 flex items-center gap-3">
            <img
              src={value.imageUrl ?? "/product-fallback.svg"}
              alt=""
              className="size-14 rounded-md border border-border object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">{value.title[locale] || t("catalog.preview.noTitle")}</p>
              {priceNum !== null ? (
                <MoneyText money={{ amount: priceNum, currency: "BRL" }} showPair className="mt-0.5" />
              ) : (
                <span className="font-money text-sm text-text-3">—</span>
              )}
            </div>
          </div>
          {(value.description["pt-BR"] || value.description.en) && (
            <p className="mt-3 line-clamp-3 text-xs text-text-2">{value.description[locale]}</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export function productToForm(p: Product): ProductFormValue {
  return {
    internalName: p.internalName,
    title: { ...p.title },
    description: { ...p.description },
    price: p.price.amount.toFixed(2),
    currency: p.price.currency,
    categoryId: p.categoryId ?? "",
    state: p.state === "archived" ? "inactive" : p.state,
    imageUrl: p.imageUrl,
  };
}
