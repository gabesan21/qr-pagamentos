import { useMemo } from "react";
import { useNavigate } from "react-router";
import { ExternalLink } from "lucide-react";
import { useI18n } from "@/i18n";
import type { DictKey } from "@/i18n";
import { useToast } from "@/components/ui/Toast";
import { DataTable } from "@/components/ui/DataTable";
import type { Column } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import type { FilterChip } from "@/components/ui/FilterBar";
import { MoneyText } from "@/components/ui/MoneyText";
import { Monogram } from "@/components/ui/Monogram";
import { CopyField } from "@/components/ui/CopyField";
import { LinkLifecycleBadge } from "@/components/ui/StatusBadge";
import type { LinkLifecycle, PaymentLinkV2 } from "@/mock/types";
import { mockFetch, paymentLinks, users } from "@/mock/fixtures";
import { DateRangeFilter, FilterSelect, useMockQuery, useUrlFilters } from "./shared";

const lifecycles: LinkLifecycle[] = ["active", "inactive", "paid", "expired"];

export default function AdminLinks() {
  const { t, formatNumber, formatDate } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { params, set, clearAll } = useUrlFilters(
    { composition: ["products", "fixed"], type: ["reusable", "single-use"], status: lifecycles, pair: ["BRL"] },
    () => toast("info", t("admin.invalidFiltersIgnored")),
  );

  const q = (params.get("q") ?? "").toLowerCase();
  const fMerchant = params.get("merchant") ?? "";
  const fComp = params.get("composition") ?? "";
  const fType = params.get("type") ?? "";
  const fStatus = params.get("status") ?? "";
  const fFrom = params.get("from") ?? "";
  const fTo = params.get("to") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = [10, 25, 50].includes(Number(params.get("size"))) ? Number(params.get("size")) : 10;

  const { data, loading, error, retry } = useMockQuery(() => mockFetch(paymentLinks, 500), []);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((l) => {
      if (fMerchant && !l.merchantUsername.toLowerCase().includes(fMerchant.toLowerCase())) return false;
      if (fComp && l.composition !== fComp) return false;
      if (fType && l.type !== fType) return false;
      if (fStatus && l.lifecycle !== fStatus) return false;
      if (fFrom && l.createdAt < new Date(fFrom).toISOString()) return false;
      if (fTo && l.createdAt > new Date(`${fTo}T23:59:59`).toISOString()) return false;
      if (q) {
        const hay = [l.identifier, l.title["pt-BR"], l.title.en, l.description["pt-BR"], l.description.en, l.merchantUsername].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, fMerchant, fComp, fType, fStatus, fFrom, fTo, q]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const rows = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  const chips: FilterChip[] = [
    fMerchant && { key: "merchant", label: `${t("admin.filter.merchant")}: ${fMerchant}`, onRemove: () => set("merchant", null) },
    fComp && { key: "composition", label: t(fComp === "products" ? "admin.composition.products" : "admin.composition.fixed"), onRemove: () => set("composition", null) },
    fType && { key: "type", label: t(fType === "reusable" ? "admin.type.reusable" : "admin.type.singleUse"), onRemove: () => set("type", null) },
    fStatus && { key: "status", label: t(`status.${fStatus}` as DictKey), onRemove: () => set("status", null) },
    (fFrom || fTo) && { key: "date", label: `${fFrom || "…"} → ${fTo || "…"}`, onRemove: () => { set("from", null); set("to", null); } },
  ].filter(Boolean) as FilterChip[];

  const columns: Column<PaymentLinkV2>[] = [
    { key: "identifier", header: t("admin.col.identifier"), render: (l) => <CopyField value={l.identifier} className="max-w-40" /> },
    {
      key: "merchant",
      header: t("admin.col.merchant"),
      render: (l) => {
        const deleted = users.find((u) => u.id === l.merchantId)?.state === "deleted";
        return (
          <span className="flex items-center gap-2">
            <Monogram name={l.merchantUsername} size={24} />
            <span className={deleted ? "line-through" : ""}>{l.merchantUsername}</span>
            {deleted && <span className="rounded-pill bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger">{t("status.deleted")}</span>}
          </span>
        );
      },
    },
    {
      key: "composition",
      header: t("admin.col.composition"),
      render: (l) => (
        <span className={`rounded-pill px-2 py-0.5 text-xs font-medium ${l.composition === "products" ? "bg-accent-soft text-text" : "bg-info-soft text-info"}`}>
          {t(l.composition === "products" ? "admin.composition.products" : "admin.composition.fixed")}
        </span>
      ),
    },
    {
      key: "type",
      header: t("admin.col.type"),
      render: (l) => <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-2">{t(l.type === "reusable" ? "admin.type.reusable" : "admin.type.singleUse")}</span>,
    },
    { key: "status", header: t("admin.col.status"), render: (l) => <LinkLifecycleBadge lifecycle={l.lifecycle} /> },
    {
      key: "amount",
      header: t("admin.col.amountProducts"),
      render: (l) =>
        l.composition === "fixed" && l.fixedAmount ? (
          <MoneyText money={l.fixedAmount} showPair />
        ) : (
          <span className="text-sm text-text-2">{t("admin.productsCount", { count: formatNumber(l.productIds.length) })}</span>
        ),
    },
    { key: "orders", header: t("admin.col.orders"), className: "text-right", render: (l) => <span className="font-money">{formatNumber(l.orderCount)}</span> },
    {
      key: "dates",
      header: t("admin.col.createdExpires"),
      render: (l) => (
        <span className="block text-xs leading-4 text-text-2">
          {formatDate(l.createdAt)}
          <span className={`block ${l.expiresAt && new Date(l.expiresAt).getTime() < Date.now() ? "text-danger" : "text-text-3"}`}>
            {l.expiresAt ? formatDate(l.expiresAt) : "—"}
          </span>
        </span>
      ),
    },
    {
      key: "actions",
      header: t("admin.col.actions"),
      render: (l) => (
        <button
          type="button"
          aria-label={t("common.open")}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/admin/payment-links/v2/${l.id}`);
          }}
          className="rounded-md p-1.5 text-text-3 hover:bg-surface-2 hover:text-accent"
        >
          <ExternalLink className="size-4" aria-hidden />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl leading-8 font-semibold tracking-[-0.02em] text-text">{t("admin.linksTitle")}</h1>
        <p className="mt-1 text-sm text-text-2">{t("admin.linksCaption")}</p>
      </div>

      <FilterBar searchPlaceholder={t("admin.searchLinks")} chips={chips} onClearAll={clearAll}>
        <FilterSelect label={t("admin.filter.merchant")} value={fMerchant} onChange={(v) => set("merchant", v || null)} allLabel={t("admin.filter.merchant")} options={users.filter((u) => u.role === "USER").map((u) => ({ value: u.username, label: u.username }))} />
        <FilterSelect label={t("admin.filter.composition")} value={fComp} onChange={(v) => set("composition", v || null)} allLabel={t("admin.filter.composition")} options={[{ value: "products", label: t("admin.composition.products") }, { value: "fixed", label: t("admin.composition.fixed") }]} />
        <FilterSelect label={t("admin.filter.linkType")} value={fType} onChange={(v) => set("type", v || null)} allLabel={t("admin.filter.linkType")} options={[{ value: "reusable", label: t("admin.type.reusable") }, { value: "single-use", label: t("admin.type.singleUse") }]} />
        <FilterSelect label={t("admin.filter.status")} value={fStatus} onChange={(v) => set("status", v || null)} allLabel={t("admin.filter.status")} options={lifecycles.map((s) => ({ value: s, label: t(`status.${s}` as DictKey) }))} />
        <FilterSelect label={t("admin.filter.currencyPair")} value={params.get("pair") ?? ""} onChange={(v) => set("pair", v || null)} allLabel={t("admin.filter.currencyPair")} options={[{ value: "BRL", label: "BRL / PIX" }]} />
        <DateRangeFilter from={fFrom} to={fTo} onFrom={(v) => set("from", v || null)} onTo={(v) => set("to", v || null)} />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(l) => l.id}
        loading={loading}
        error={error}
        onRetry={retry}
        emptyVariant={chips.length > 0 || q ? "filtered" : "empty"}
        emptyIllustration="links"
        emptyTitle={t("empty.links.title")}
        onClearFilters={clearAll}
        onRowClick={(l) => navigate(`/admin/payment-links/v2/${l.id}`)}
        page={clampedPage}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => set("page", String(p))}
        onPageSizeChange={(s) => set("size", String(s))}
      />
    </div>
  );
}
