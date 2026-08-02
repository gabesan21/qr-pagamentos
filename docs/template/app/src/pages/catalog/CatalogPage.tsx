import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useI18n } from "@/i18n";
import { useSession } from "@/mock/session";
import type { Category, Product } from "@/mock/types";
import { categories as categoryFixtures, mockFetch, products as productFixtures } from "@/mock/fixtures";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/DataTable";
import type { Column } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import type { FilterChip } from "@/components/ui/FilterBar";
import { EntityStateBadge } from "@/components/ui/StatusBadge";
import { MoneyText } from "@/components/ui/MoneyText";
import { useToast } from "@/components/ui/Toast";
import { NativeSelect } from "./fields";

const STATES = ["active", "inactive", "archived"] as const;

export default function CatalogPage() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rows, setRows] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [page, setPage] = useState(() => Math.max(1, Number(params.get("page")) || 1));
  const [pageSize, setPageSize] = useState(() => {
    const v = Number(params.get("pageSize"));
    return [10, 25, 50].includes(v) ? v : 10;
  });

  // URL-synced filters (invalid params ignored + info toast)
  const q = params.get("q") ?? "";
  const rawState = params.get("state") ?? "";
  const rawCat = params.get("cat") ?? "";

  useEffect(() => {
    const invalid =
      (rawState && !(STATES as readonly string[]).includes(rawState)) ||
      (rawCat && !categoryFixtures.some((c) => c.id === rawCat && c.merchantId === user?.id));
    if (invalid) {
      toast("info", t("catalog.invalidParams"));
      const next = new URLSearchParams(params);
      if (rawState && !(STATES as readonly string[]).includes(rawState)) next.delete("state");
      if (rawCat && !categoryFixtures.some((c) => c.id === rawCat && c.merchantId === user?.id)) next.delete("cat");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawState, rawCat]);

  const state = (STATES as readonly string[]).includes(rawState) ? (rawState as Product["state"]) : "";
  const cat = cats.some((c) => c.id === rawCat) ? rawCat : "";

  const load = () => {
    if (!user) return;
    setLoading(true);
    setError(false);
    mockFetch({
      products: productFixtures.filter((p) => p.merchantId === user.id),
      categories: categoryFixtures.filter((c) => c.merchantId === user.id),
    })
      .then((d) => {
        setRows(d.products);
        setCats(d.categories);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(load, [user?.id]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((p) => {
      if (state && p.state !== state) return false;
      if (cat && p.categoryId !== cat) return false;
      if (needle) {
        const hay = [p.internalName, p.title["pt-BR"], p.title.en].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, state, cat]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next, { replace: true });
    setPage(1);
  };

  const clearAll = () => {
    setParams(new URLSearchParams(), { replace: true });
    setPage(1);
  };

  const chips: FilterChip[] = [];
  if (state)
    chips.push({ key: "state", label: `${t("catalog.filterState")}: ${t(`status.${state}`)}`, onRemove: () => setFilter("state", "") });
  if (cat) {
    const c = cats.find((x) => x.id === cat);
    chips.push({
      key: "cat",
      label: `${t("catalog.filterCategory")}: ${c?.name[locale] ?? cat}`,
      onRemove: () => setFilter("cat", ""),
    });
  }

  const catName = (id: string | null) => {
    if (!id) return <span className="text-text-3">—</span>;
    const c = cats.find((x) => x.id === id);
    return c ? (
      <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-2">{c.name[locale]}</span>
    ) : (
      <span className="text-text-3">—</span>
    );
  };

  const columns: Column<Product>[] = [
    {
      key: "image",
      header: t("catalog.colImage"),
      render: (p) => (
        <motion.img
          key={p.imageUrl ?? "fallback"}
          src={p.imageUrl ?? "/product-fallback.svg"}
          alt=""
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="size-10 rounded-md border border-border object-cover"
        />
      ),
    },
    { key: "internal", header: t("catalog.colInternalName"), render: (p) => <span className="font-medium">{p.internalName}</span> },
    {
      key: "title",
      header: t("catalog.colTitle"),
      render: (p) => {
        const other = locale === "pt-BR" ? p.title.en : p.title["pt-BR"];
        return (
          <span className="block">
            <span className="block">{p.title[locale]}</span>
            {other && <span className="block text-xs text-text-2">{other}</span>}
          </span>
        );
      },
    },
    { key: "price", header: t("catalog.colPrice"), mono: true, render: (p) => <MoneyText money={p.price} showPair /> },
    { key: "category", header: t("catalog.colCategory"), render: (p) => catName(p.categoryId) },
    { key: "state", header: t("catalog.colState"), render: (p) => <EntityStateBadge state={p.state} /> },
    {
      key: "actions",
      header: t("catalog.colActions"),
      render: (p) =>
        p.state === "archived" ? (
          <Button variant="ghost" size="sm" onClick={() => navigate(`/catalog/products/${p.id}`)}>
            {t("catalog.inspect")}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => navigate(`/catalog/products/${p.id}`)}>
            {t("catalog.edit")}
          </Button>
        ),
    },
  ];

  const isFiltered = Boolean(q || state || cat);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl leading-8 font-semibold text-text">{t("catalog.title")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" asChild>
            <Link to="/catalog/categories">{t("catalog.manageCategories")}</Link>
          </Button>
          <Button asChild>
            <Link to="/catalog/products/new">
              <Plus className="size-4" aria-hidden />
              {t("catalog.newProduct")}
            </Link>
          </Button>
        </div>
      </div>

      <FilterBar
        searchPlaceholder={t("catalog.searchPlaceholder")}
        chips={chips}
        onClearAll={isFiltered ? clearAll : undefined}
      >
        <NativeSelect
          ariaLabel={t("catalog.filterState")}
          value={state}
          onChange={(v) => setFilter("state", v)}
          options={[
            { value: "", label: `${t("catalog.filterState")}: ${t("common.all")}` },
            ...STATES.map((s) => ({ value: s, label: t(`status.${s}`) })),
          ]}
          className="w-44"
        />
        <NativeSelect
          ariaLabel={t("catalog.filterCategory")}
          value={cat}
          onChange={(v) => setFilter("cat", v)}
          options={[
            { value: "", label: `${t("catalog.filterCategory")}: ${t("common.all")}` },
            ...cats.map((c) => ({ value: c.id, label: c.name[locale] })),
          ]}
          className="w-44"
        />
      </FilterBar>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <DataTable
          columns={columns}
          rows={pageRows}
          rowKey={(p) => p.id}
          loading={loading}
          error={error}
          onRetry={load}
          emptyVariant={isFiltered ? "filtered" : "empty"}
          emptyIllustration="products"
          emptyTitle={t("catalog.emptyTitle")}
          emptyBody={t("catalog.emptyBody")}
          emptyAction={
            <Button asChild>
              <Link to="/catalog/products/new">{t("catalog.emptyCta")}</Link>
            </Button>
          }
          onClearFilters={clearAll}
          page={clampedPage}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={(p) => {
            setPage(p);
            const next = new URLSearchParams(params);
            next.set("page", String(p));
            setParams(next, { replace: true });
          }}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </motion.div>
    </div>
  );
}
