import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useI18n } from "@/i18n";
import { useSession } from "@/mock/session";
import type { Category, Product } from "@/mock/types";
import { categories as categoryFixtures, mockFetch, mockLatency, products as productFixtures } from "@/mock/fixtures";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/DataTable";
import type { Column } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import type { FilterChip } from "@/components/ui/FilterBar";
import { EntityStateBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Banner, Breadcrumb, Field, NativeSelect, inputCls } from "./fields";

export default function CategoriesPage() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [newPt, setNewPt] = useState("");
  const [newEn, setNewEn] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPt, setEditPt] = useState("");
  const [editEn, setEditEn] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [deactTarget, setDeactTarget] = useState<Category | null>(null);
  const [replacement, setReplacement] = useState("");
  const [acting, setActing] = useState(false);

  const q = params.get("q") ?? "";
  const rawState = params.get("state") ?? "";
  const stateFilter = rawState === "active" || rawState === "inactive" ? rawState : "";

  const load = () => {
    if (!user) return;
    setLoading(true);
    setError(false);
    mockFetch({
      categories: categoryFixtures.filter((c) => c.merchantId === user.id && c.state !== "archived"),
      products: productFixtures.filter((p) => p.merchantId === user.id),
    })
      .then((d) => {
        setCats(d.categories);
        setProducts(d.products);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(load, [user?.id]);

  const refCount = (id: string) => products.filter((p) => p.categoryId === id && p.state !== "archived").length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cats.filter((c) => {
      if (stateFilter && c.state !== stateFilter) return false;
      if (needle && !`${c.name["pt-BR"]} ${c.name.en}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [cats, q, stateFilter]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const clearAll = () => setParams(new URLSearchParams(), { replace: true });

  const chips: FilterChip[] = stateFilter
    ? [{ key: "state", label: `${t("catalog.filterState")}: ${t(`status.${stateFilter}`)}`, onRemove: () => setFilter("state", "") }]
    : [];

  const duplicateName = (pt: string, en: string, excludeId?: string) => {
    const p = pt.trim().toLowerCase();
    const e = en.trim().toLowerCase();
    return cats.some((c) => c.id !== excludeId && (c.name["pt-BR"].toLowerCase() === p || c.name.en.toLowerCase() === e));
  };

  const add = async () => {
    if (!newPt.trim() || !newEn.trim()) {
      setNewError(t("catalog.err.required"));
      return;
    }
    if (duplicateName(newPt, newEn)) {
      setNewError(t("catalog.categories.duplicate"));
      return;
    }
    setAdding(true);
    setNewError(null);
    await mockLatency(500);
    const cat: Category = {
      id: `c_${Math.random().toString(36).slice(2, 9)}`,
      merchantId: user!.id,
      name: { "pt-BR": newPt.trim(), en: newEn.trim() },
      state: "active",
      createdAt: new Date().toISOString(),
    };
    categoryFixtures.push(cat);
    setCats((cs) => [...cs, cat]);
    setNewPt("");
    setNewEn("");
    setAdding(false);
    toast("success", t("catalog.categories.addSuccess"));
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setEditPt(c.name["pt-BR"]);
    setEditEn(c.name.en);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editPt.trim() || !editEn.trim()) {
      setEditError(t("catalog.err.required"));
      return;
    }
    if (duplicateName(editPt, editEn, editingId)) {
      setEditError(t("catalog.categories.duplicate"));
      return;
    }
    setActing(true);
    await mockLatency(400);
    // Simulated edit conflict: ~20% of inline saves fail inline.
    if (Math.random() < 0.2) {
      setEditError(t("catalog.categories.editConflict"));
      setActing(false);
      return;
    }
    const fx = categoryFixtures.find((c) => c.id === editingId);
    if (fx) fx.name = { "pt-BR": editPt.trim(), en: editEn.trim() };
    setCats((cs) => cs.map((c) => (c.id === editingId ? { ...c, name: { "pt-BR": editPt.trim(), en: editEn.trim() } } : c)));
    setEditingId(null);
    setActing(false);
  };

  const openDeactivate = (c: Category) => {
    setDeactTarget(c);
    const firstReplacement = cats.find((x) => x.state === "active" && x.id !== c.id);
    setReplacement(firstReplacement?.id ?? "");
  };

  const deactivate = async () => {
    if (!deactTarget) return;
    const count = refCount(deactTarget.id);
    if (count > 0) {
      const ok = cats.some((x) => x.state === "active" && x.id !== deactTarget.id);
      if (!ok || !replacement) return; // blocked — no replacement available
    }
    setActing(true);
    await mockLatency(500);
    if (count > 0) {
      productFixtures.forEach((p) => {
        if (p.categoryId === deactTarget.id) p.categoryId = replacement;
      });
      setProducts((ps) => ps.map((p) => (p.categoryId === deactTarget.id ? { ...p, categoryId: replacement } : p)));
    }
    const fx = categoryFixtures.find((c) => c.id === deactTarget.id);
    if (fx) fx.state = "inactive";
    setCats((cs) => cs.map((c) => (c.id === deactTarget.id ? { ...c, state: "inactive" } : c)));
    setActing(false);
    setDeactTarget(null);
    toast("success", t("catalog.categories.deactivateSuccess"));
  };

  const columns: Column<Category>[] = [
    {
      key: "pt",
      header: t("catalog.categories.namePt"),
      render: (c) =>
        editingId === c.id ? (
          <input className={inputCls} value={editPt} onChange={(e) => setEditPt(e.target.value)} aria-label={t("catalog.categories.namePt")} />
        ) : (
          <span className="font-medium">{c.name["pt-BR"]}</span>
        ),
    },
    {
      key: "en",
      header: t("catalog.categories.nameEn"),
      render: (c) =>
        editingId === c.id ? (
          <input className={inputCls} value={editEn} onChange={(e) => setEditEn(e.target.value)} aria-label={t("catalog.categories.nameEn")} />
        ) : (
          c.name.en
        ),
    },
    { key: "state", header: t("catalog.colState"), render: (c) => <EntityStateBadge state={c.state} /> },
    {
      key: "products",
      header: t("catalog.categories.colProducts"),
      mono: true,
      render: (c) => {
        const n = refCount(c.id);
        return <span className={n === 0 ? "text-text-3" : ""}>{n}</span>;
      },
    },
    {
      key: "actions",
      header: t("catalog.colActions"),
      render: (c) =>
        editingId === c.id ? (
          <span className="flex items-center gap-2">
            <Button size="sm" onClick={saveEdit} disabled={acting}>
              {t("common.save")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
              {t("common.cancel")}
            </Button>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => startEdit(c)}>
              {t("common.edit")}
            </Button>
            {c.state === "active" && (
              <Button variant="ghost" size="sm" className="text-danger" onClick={() => openDeactivate(c)}>
                {t("catalog.categories.deactivate")}
              </Button>
            )}
          </span>
        ),
    },
  ];

  const deactCount = deactTarget ? refCount(deactTarget.id) : 0;
  const replacementOptions = cats.filter((x) => x.state === "active" && x.id !== deactTarget?.id);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: t("catalog.breadcrumb"), to: "/catalog" }, { label: t("catalog.categories.title") }]} />
      <h1 className="font-display text-2xl leading-8 font-semibold text-text">{t("catalog.categories.title")}</h1>

      {/* Inline creation row */}
      <div className="rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field label={t("catalog.categories.namePt")} htmlFor="nc-pt" error={newError}>
            <input id="nc-pt" className={inputCls} value={newPt} onChange={(e) => setNewPt(e.target.value)} />
          </Field>
          <Field label={t("catalog.categories.nameEn")} htmlFor="nc-en">
            <input id="nc-en" className={inputCls} value={newEn} onChange={(e) => setNewEn(e.target.value)} />
          </Field>
          <Button onClick={add} disabled={adding}>
            <Plus className="size-4" aria-hidden />
            {adding ? t("common.loading") : t("catalog.categories.add")}
          </Button>
        </div>
      </div>

      <FilterBar searchPlaceholder={t("catalog.categories.searchPlaceholder")} chips={chips} onClearAll={q || stateFilter ? clearAll : undefined}>
        <NativeSelect
          ariaLabel={t("catalog.filterState")}
          value={stateFilter}
          onChange={(v) => setFilter("state", v)}
          options={[
            { value: "", label: `${t("catalog.filterState")}: ${t("common.all")}` },
            { value: "active", label: t("status.active") },
            { value: "inactive", label: t("status.inactive") },
          ]}
          className="w-44"
        />
      </FilterBar>

      {editError && editingId && (
        <Banner tone="danger">{editError}</Banner>
      )}

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(c) => c.id}
          loading={loading}
          error={error}
          onRetry={load}
          emptyVariant={q || stateFilter ? "filtered" : "empty"}
          emptyIllustration="products"
          emptyTitle={t("catalog.categories.emptyTitle")}
          emptyBody={t("catalog.categories.emptyBody")}
          onClearFilters={clearAll}
        />
      </motion.div>

      {/* Deactivation flow */}
      {deactTarget !== null && deactCount === 0 ? (
        <ConfirmDialog
          open
          onClose={() => setDeactTarget(null)}
          onConfirm={deactivate}
          title={t("catalog.categories.deactivateTitle")}
          confirmLabel={t("catalog.categories.deactivate")}
          loading={acting}
          body={t("catalog.categories.deactivateSimple")}
        />
      ) : (
        <Modal
          open={deactTarget !== null}
          onClose={() => setDeactTarget(null)}
          title={t("catalog.categories.deactivateTitle")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeactTarget(null)} disabled={acting}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={deactivate}
                disabled={acting || replacementOptions.length === 0 || !replacement}
              >
                {acting ? t("common.loading") : t("catalog.categories.deactivate")}
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-sm text-text-2">
            <p>{t("catalog.categories.referencing", { count: deactCount })}</p>
            {replacementOptions.length > 0 ? (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.16 }}>
                <Field label={t("catalog.categories.moveProductsTo")}>
                  <NativeSelect
                    value={replacement}
                    onChange={setReplacement}
                    options={replacementOptions.map((c) => ({ value: c.id, label: c.name[locale] }))}
                  />
                </Field>
              </motion.div>
            ) : (
              <Banner tone="warning">{t("catalog.categories.noReplacement")}</Banner>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
