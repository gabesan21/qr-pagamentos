import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { motion } from "framer-motion";
import { Archive } from "lucide-react";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { EntityStateBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Banner, Breadcrumb } from "./fields";
import { parsePrice, ProductForm, productToForm, validateProduct } from "./ProductForm";
import type { ProductFormErrors, ProductFormValue } from "./ProductForm";

type LoadState = "loading" | "ready" | "error" | "unavailable";

export default function ProductDetailPage() {
  const { t } = useI18n();
  const { user } = useSession();
  const { toast } = useToast();
  const { id } = useParams<{ id: string }>();

  const [state, setState] = useState<LoadState>("loading");
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyMapping[]>([]);
  const [existingNames, setExistingNames] = useState<string[]>([]);

  const [value, setValue] = useState<ProductFormValue | null>(null);
  const [baseline, setBaseline] = useState<string>("");
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [removeImageOpen, setRemoveImageOpen] = useState(false);
  const [acting, setActing] = useState(false);

  const load = () => {
    if (!user || !id) return;
    setState("loading");
    setConflict(false);
    mockFetch({
      product: productFixtures.find((p) => p.id === id && p.merchantId === user.id) ?? null,
      categories: categoryFixtures.filter((c) => c.merchantId === user.id),
      currencies: merchantSettings.find((m) => m.merchantId === user.id)?.supportedCurrencies ?? [],
      names: productFixtures
        .filter((p) => p.merchantId === user.id && p.id !== id)
        .map((p) => p.internalName.toLowerCase()),
    })
      .then((d) => {
        setCategories(d.categories);
        setCurrencies(d.currencies);
        setExistingNames(d.names);
        if (!d.product) {
          setState("unavailable");
          return;
        }
        setProduct(d.product);
        const form = productToForm(d.product);
        setValue(form);
        setBaseline(JSON.stringify(form));
        setErrors({});
        setState("ready");
      })
      .catch(() => setState("error"));
  };

  useEffect(load, [user?.id, id]);

  const dirty = useMemo(() => value !== null && JSON.stringify(value) !== baseline, [value, baseline]);
  const archived = product?.state === "archived";

  const persist = (patch: Partial<Product>) => {
    const idx = productFixtures.findIndex((p) => p.id === product!.id);
    if (idx >= 0) Object.assign(productFixtures[idx], patch);
    setProduct((p) => (p ? { ...p, ...patch } : p));
  };

  const save = async () => {
    if (!value) return;
    const e = validateProduct(value, existingNames, t);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    setConflict(false);
    try {
      await mockLatency(600);
      // Simulated concurrent-edit conflict: ~25% of saves fail once with a safe banner.
      if (Math.random() < 0.25) {
        setConflict(true);
        return;
      }
      persist({
        internalName: value.internalName.trim(),
        title: { "pt-BR": value.title["pt-BR"].trim(), en: value.title.en.trim() },
        description: { "pt-BR": value.description["pt-BR"].trim(), en: value.description.en.trim() },
        price: { amount: parsePrice(value.price), currency: "BRL" },
        categoryId: value.categoryId || null,
        imageUrl: value.imageUrl,
        state: value.state,
      });
      setBaseline(JSON.stringify(value));
      toast("success", t("catalog.detail.saveSuccess"));
    } catch {
      toast("error", t("common.requestError"), { onRetry: save });
    } finally {
      setSaving(false);
    }
  };

  const toggleState = async () => {
    if (!product || !value) return;
    setActing(true);
    await mockLatency(500);
    const next = value.state === "active" ? "inactive" : "active";
    const nv = { ...value, state: next as "active" | "inactive" };
    setValue(nv);
    persist({ state: nv.state });
    setBaseline(JSON.stringify(nv));
    setActing(false);
    setToggleOpen(false);
    toast("success", t("catalog.detail.stateChanged"));
  };

  const archive = async () => {
    if (!product) return;
    setActing(true);
    await mockLatency(500);
    persist({ state: "archived" });
    setActing(false);
    setArchiveOpen(false);
    toast("success", t("catalog.detail.archiveSuccess"));
  };

  if (state === "loading") return <DetailSkeleton />;

  if (state === "error")
    return (
      <Banner tone="danger">
        <div className="flex items-center justify-between gap-3">
          <span>{t("common.requestError")}</span>
          <Button variant="ghost" size="sm" onClick={load}>
            {t("common.retry")}
          </Button>
        </div>
      </Banner>
    );

  if (state === "unavailable" || !product || !value)
    return <EmptyState illustration="unavailable" title={t("common.unavailable")} body={t("catalog.detail.unavailableBody")} />;

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: t("catalog.breadcrumb"), to: "/catalog" }, { label: product.internalName }]} />

      <div className="flex flex-wrap items-center gap-3">
        <img
          src={product.imageUrl ?? "/product-fallback.svg"}
          alt=""
          className="size-12 rounded-md border border-border object-cover"
        />
        <h1 className="font-display text-2xl leading-8 font-semibold text-text">{product.internalName}</h1>
        <EntityStateBadge state={product.state} />
      </div>

      {conflict && (
        <Banner tone="danger">
          <p className="font-medium">{t("catalog.detail.conflict")}</p>
          <p className="mt-0.5">{t("catalog.detail.conflictBody")}</p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" size="sm" onClick={load}>
              {t("catalog.detail.reload")}
            </Button>
            <Button variant="ghost" size="sm" onClick={save}>
              {t("common.retry")}
            </Button>
          </div>
        </Banner>
      )}

      {archived && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Banner tone="warning">
            <p className="font-medium">{t("catalog.detail.archivedBanner")}</p>
            <p className="mt-0.5">{t("catalog.detail.readOnly")}</p>
          </Banner>
        </motion.div>
      )}

      <motion.div
        animate={{ filter: archived ? "saturate(0.4)" : "saturate(1)" }}
        transition={{ duration: 0.3 }}
        className={archived ? "rounded-card border border-border bg-surface-2 p-5 sm:p-6" : "rounded-card border border-border bg-surface p-5 shadow-card sm:p-6"}
      >
        <ProductForm
          value={value}
          onChange={setValue}
          errors={errors}
          categories={categories}
          currencies={currencies}
          readOnly={archived}
        />
      </motion.div>

      {!archived && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setToggleOpen(true)}
              disabled={acting}
            >
              {value.state === "active" ? t("catalog.detail.deactivate") : t("catalog.detail.activate")}
            </Button>
            <Button variant="outline" className="border-danger/40 text-danger hover:bg-danger-soft" onClick={() => setArchiveOpen(true)} disabled={acting}>
              <Archive className="size-4" aria-hidden />
              {t("catalog.detail.archive")}
            </Button>
            {product.imageUrl && value.imageUrl && (
              <Button variant="ghost" size="sm" className="text-danger" onClick={() => setRemoveImageOpen(true)}>
                {t("catalog.upload.remove")}
              </Button>
            )}
          </div>
          <Button onClick={save} disabled={!dirty || saving}>
            {saving ? t("common.loading") : t("common.save")}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={archive}
        title={t("catalog.detail.archiveTitle")}
        body={t("catalog.detail.archiveBody")}
        confirmLabel={t("catalog.detail.archive")}
        loading={acting}
      />
      <ConfirmDialog
        open={toggleOpen}
        onClose={() => setToggleOpen(false)}
        onConfirm={toggleState}
        title={t("catalog.detail.toggleStateTitle")}
        body={value.state === "active" ? t("catalog.detail.deactivateBody") : t("catalog.detail.activateBody")}
        destructive={value.state === "active"}
        confirmLabel={value.state === "active" ? t("catalog.detail.deactivate") : t("catalog.detail.activate")}
        loading={acting}
      />
      <ConfirmDialog
        open={removeImageOpen}
        onClose={() => setRemoveImageOpen(false)}
        onConfirm={() => {
          setValue({ ...value, imageUrl: null });
          setRemoveImageOpen(false);
        }}
        title={t("catalog.detail.removeImageTitle")}
        body={t("catalog.detail.removeImageBody")}
        confirmLabel={t("catalog.upload.remove")}
      />
    </div>
  );
}
