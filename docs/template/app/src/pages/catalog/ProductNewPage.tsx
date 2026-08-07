import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { useI18n } from "@/i18n";
import { useSession } from "@/mock/session";
import type { Category, CurrencyMapping, Product } from "@/mock/types";
import {
  categories as categoryFixtures,
  merchantSettings,
  mockFetch,
  mockLatency,
  products as productFixtures,
} from "@/mock/fixtures";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { DetailSkeleton } from "@/components/ui/Skeletons";
import { Banner, Breadcrumb } from "./fields";
import { parsePrice, ProductForm, validateProduct } from "./ProductForm";
import type { ProductFormErrors, ProductFormValue } from "./ProductForm";

export default function ProductNewPage() {
  const { t } = useI18n();
  const { user } = useSession();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyMapping[]>([]);
  const [existingNames, setExistingNames] = useState<string[]>([]);

  const [value, setValue] = useState<ProductFormValue>({
    internalName: "",
    title: { "pt-BR": "", en: "" },
    description: { "pt-BR": "", en: "" },
    price: "",
    currency: "",
    categoryId: "",
    state: "active",
    imageUrl: null,
  });
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const load = () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    mockFetch({
      categories: categoryFixtures.filter((c) => c.merchantId === user.id),
      currencies: merchantSettings.find((m) => m.merchantId === user.id)?.supportedCurrencies ?? [],
      names: productFixtures.filter((p) => p.merchantId === user.id).map((p) => p.internalName.toLowerCase()),
    })
      .then((d) => {
        setCategories(d.categories);
        setCurrencies(d.currencies);
        setExistingNames(d.names);
        const def = user.storefront.defaultCurrency;
        if (def && d.currencies.some((c) => c.active && c.code === def)) {
          setValue((v) => ({ ...v, currency: def }));
        }
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(load, [user?.id]);

  const taken = useMemo(() => existingNames, [existingNames]);

  const submit = async () => {
    const e = validateProduct(value, taken, t);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      await mockLatency(600);
      const product: Product = {
        id: `p_${Math.random().toString(36).slice(2, 9)}`,
        merchantId: user!.id,
        internalName: value.internalName.trim(),
        title: { "pt-BR": value.title["pt-BR"].trim(), en: value.title.en.trim() },
        description: { "pt-BR": value.description["pt-BR"].trim(), en: value.description.en.trim() },
        price: { amount: parsePrice(value.price), currency: "BRL" },
        categoryId: value.categoryId || null,
        imageUrl: value.imageUrl,
        state: value.state,
        createdAt: new Date().toISOString(),
      };
      productFixtures.push(product);
      toast("success", t("catalog.create.success"));
      navigate(`/catalog/products/${product.id}`);
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: t("catalog.breadcrumb"), to: "/catalog" }, { label: t("catalog.new.title") }]} />
      <h1 className="font-display text-2xl leading-8 font-semibold text-text">{t("catalog.new.title")}</h1>

      {loading ? (
        <DetailSkeleton />
      ) : loadError ? (
        <Banner tone="danger">
          <div className="flex items-center justify-between gap-3">
            <span>{t("common.requestError")}</span>
            <Button variant="ghost" size="sm" onClick={load}>
              {t("common.retry")}
            </Button>
          </div>
        </Banner>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="space-y-5">
          {submitError && (
            <Banner tone="danger">
              <div className="flex items-center justify-between gap-3">
                <span>{t("catalog.create.error")}</span>
                <Button variant="ghost" size="sm" onClick={submit}>
                  {t("common.retry")}
                </Button>
              </div>
            </Banner>
          )}
          <div className="rounded-card border border-border bg-surface p-5 shadow-card sm:p-6">
            <ProductForm value={value} onChange={setValue} errors={errors} categories={categories} currencies={currencies} />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => navigate("/catalog")} disabled={submitting}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? t("common.loading") : t("catalog.create.submit")}
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
