import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useI18n } from "@/i18n";
import { useSession } from "@/mock/session";
import type { LegacyLink, PaymentLinkV2 } from "@/mock/types";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/DataTable";
import type { Column } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import type { FilterChip } from "@/components/ui/FilterBar";
import { LinkLifecycleBadge } from "@/components/ui/StatusBadge";
import { CopyField } from "@/components/ui/CopyField";
import { MoneyText } from "@/components/ui/MoneyText";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { fetchLinks } from "./linkStore";
import { PairChip, formCls } from "./shared";

type Row = { era: "v2"; link: PaymentLinkV2 } | { era: "legacy"; link: LegacyLink };

const VALID = {
  comp: ["products", "fixed"],
  type: ["reusable", "single-use"],
  status: ["active", "inactive", "paid", "expired"],
  currency: ["BRL_PIX"],
  era: ["v2", "legacy"],
};

export default function LinksDirectory() {
  const { t, locale, formatDateTime } = useI18n();
  const { user } = useSession();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  const [legacyView, setLegacyView] = useState<LegacyLink | null>(null);
  const warned = useRef(false);

  const load = useCallback(() => {
    if (!user) return;
    setError(false);
    fetchLinks(user.id)
      .then(({ v2, legacy }) => {
        const merged: Row[] = [
          ...v2.map((link): Row => ({ era: "v2", link })),
          ...legacy.map((link): Row => ({ era: "legacy", link })),
        ].sort((a, b) => (a.link.createdAt < b.link.createdAt ? 1 : -1));
        setRows(merged);
      })
      .catch(() => setError(true));
  }, [user]);

  useEffect(load, [load]);

  // Validate URL filter params; invalid ones are ignored + info toast (design.md §7).
  useEffect(() => {
    if (warned.current) return;
    const bad: string[] = [];
    for (const [key, valid] of Object.entries(VALID)) {
      const v = params.get(key);
      if (v && !valid.includes(v)) bad.push(key);
    }
    if (bad.length > 0) {
      warned.current = true;
      const next = new URLSearchParams(params);
      bad.forEach((k) => next.delete(k));
      setParams(next, { replace: true });
      toast("info", t("links.invalidParams"));
    }
  }, [params, setParams, toast, t]);

  const get = (k: string) => params.get(k) ?? "";
  const q = get("q").toLowerCase();
  const comp = get("comp");
  const type = get("type");
  const status = get("status");
  const era = get("era");
  const from = get("from");
  const to = get("to");
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = Number(params.get("pageSize") ?? "10") || 10;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((row) => {
      if (era && row.era !== era) return false;
      const link = row.link;
      if (q) {
        const hay =
          row.era === "v2"
            ? `${link.identifier} ${(link as PaymentLinkV2).description["pt-BR"]} ${(link as PaymentLinkV2).description.en}`.toLowerCase()
            : `${link.identifier} ${(link as LegacyLink).title["pt-BR"]} ${(link as LegacyLink).title.en}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (status) {
        const s = row.era === "v2" ? (link as PaymentLinkV2).lifecycle : (link as LegacyLink).state;
        if (s !== status) return false;
      }
      if (comp && (row.era === "legacy" || (link as PaymentLinkV2).composition !== comp)) return false;
      if (type && (row.era === "legacy" || (link as PaymentLinkV2).type !== type)) return false;
      if (from && link.createdAt < new Date(from).toISOString()) return false;
      if (to && link.createdAt > new Date(`${to}T23:59:59`).toISOString()) return false;
      return true;
    });
  }, [rows, era, q, status, comp, type, from, to]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  const hasFilters = Boolean(q || comp || type || status || era || from || to);
  const clearAll = () => setParams(new URLSearchParams(), { replace: true });

  const chips: FilterChip[] = [
    comp && { key: "comp", label: `${t("links.filter.composition")}: ${t(comp === "products" ? "links.comp.products" : "links.comp.fixed")}`, onRemove: () => setParam("comp", "") },
    type && { key: "type", label: `${t("links.filter.type")}: ${t(type === "reusable" ? "links.type.reusable" : "links.type.singleUse")}`, onRemove: () => setParam("type", "") },
    status && { key: "status", label: `${t("links.filter.status")}: ${t(`status.${status}` as Parameters<typeof t>[0])}`, onRemove: () => setParam("status", "") },
    era && { key: "era", label: `${t("links.filter.era")}: ${t(era === "v2" ? "links.era.v2" : "links.era.legacy")}`, onRemove: () => setParam("era", "") },
    from && { key: "from", label: `${t("common.from")}: ${from}`, onRemove: () => setParam("from", "") },
    to && { key: "to", label: `${t("common.to")}: ${to}`, onRemove: () => setParam("to", "") },
  ].filter(Boolean) as FilterChip[];

  const summaryOf = (row: Row) =>
    row.era === "v2"
      ? (row.link as PaymentLinkV2).description[locale] || (row.link as PaymentLinkV2).description["pt-BR"]
      : (row.link as LegacyLink).title[locale] || (row.link as LegacyLink).title["pt-BR"];

  const columns: Column<Row>[] = [
    {
      key: "identifier",
      header: t("links.col.identifier"),
      mono: true,
      render: (row) => (
        <span className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <CopyField value={row.link.identifier} />
          {row.era === "legacy" && (
            <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-3">
              {t("links.legacyBadge")}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "summary",
      header: t("links.col.summary"),
      render: (row) => <span className="text-xs text-text-2 line-clamp-2">{summaryOf(row)}</span>,
    },
    {
      key: "composition",
      header: t("links.col.composition"),
      render: (row) => (
        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-2">
          {row.era === "v2"
            ? t((row.link as PaymentLinkV2).composition === "products" ? "links.comp.products" : "links.comp.fixed")
            : t("links.comp.fixed")}
        </span>
      ),
    },
    {
      key: "type",
      header: t("links.col.type"),
      render: (row) =>
        row.era === "v2" ? (
          <span className="rounded-pill border border-border px-2 py-0.5 text-xs text-text-2">
            {t((row.link as PaymentLinkV2).type === "reusable" ? "links.type.reusable" : "links.type.singleUse")}
          </span>
        ) : (
          <span className="text-xs text-text-3">—</span>
        ),
    },
    {
      key: "status",
      header: t("links.col.status"),
      render: (row) =>
        row.era === "v2" ? (
          <LinkLifecycleBadge lifecycle={(row.link as PaymentLinkV2).lifecycle} />
        ) : (
          <LinkLifecycleBadge lifecycle={(row.link as LegacyLink).state} />
        ),
    },
    { key: "currency", header: t("links.col.currency"), render: () => <PairChip /> },
    {
      key: "dates",
      header: t("links.col.dates"),
      render: (row) => (
        <div className="text-xs leading-4">
          <div className="text-text-2">{formatDateTime(row.link.createdAt)}</div>
          <div className="text-text-3">{row.link.expiresAt ? formatDateTime(row.link.expiresAt) : t("links.noExpiration")}</div>
        </div>
      ),
    },
    {
      key: "actions",
      header: t("links.col.actions"),
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            if (row.era === "v2") navigate(`/links/v2/${row.link.id}`);
            else setLegacyView(row.link as LegacyLink);
          }}
        >
          {t("links.open")}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-text">{t("links.title")}</h1>
        <Button onClick={() => navigate("/links/new")}>
          <Plus aria-hidden /> {t("links.create")}
        </Button>
      </div>

      <FilterBar searchPlaceholder={t("links.search.placeholder")} chips={chips} onClearAll={clearAll}>
        <select aria-label={t("links.filter.era")} value={era} onChange={(e) => setParam("era", e.target.value)} className={formCls.input + " h-10 w-auto"}>
          <option value="">{t("links.filter.era")}: {t("common.all")}</option>
          <option value="v2">{t("links.era.v2")}</option>
          <option value="legacy">{t("links.era.legacy")}</option>
        </select>
        <select aria-label={t("links.filter.composition")} value={comp} onChange={(e) => setParam("comp", e.target.value)} className={formCls.input + " h-10 w-auto"}>
          <option value="">{t("links.filter.composition")}: {t("common.all")}</option>
          <option value="products">{t("links.comp.products")}</option>
          <option value="fixed">{t("links.comp.fixed")}</option>
        </select>
        <select aria-label={t("links.filter.type")} value={type} onChange={(e) => setParam("type", e.target.value)} className={formCls.input + " h-10 w-auto"}>
          <option value="">{t("links.filter.type")}: {t("common.all")}</option>
          <option value="reusable">{t("links.type.reusable")}</option>
          <option value="single-use">{t("links.type.singleUse")}</option>
        </select>
        <select aria-label={t("links.filter.status")} value={status} onChange={(e) => setParam("status", e.target.value)} className={formCls.input + " h-10 w-auto"}>
          <option value="">{t("links.filter.status")}: {t("common.all")}</option>
          <option value="active">{t("status.active")}</option>
          <option value="inactive">{t("status.inactive")}</option>
          <option value="paid">{t("status.paid")}</option>
          <option value="expired">{t("status.expired")}</option>
        </select>
        <select aria-label={t("links.filter.currency")} value={get("currency")} onChange={(e) => setParam("currency", e.target.value)} className={formCls.input + " h-10 w-auto"}>
          <option value="">{t("links.filter.currency")}: {t("common.all")}</option>
          <option value="BRL_PIX">BRL / PIX</option>
        </select>
        <input type="date" aria-label={t("common.from")} value={from} onChange={(e) => setParam("from", e.target.value)} className={formCls.input + " h-10 w-auto"} />
        <input type="date" aria-label={t("common.to")} value={to} onChange={(e) => setParam("to", e.target.value)} className={formCls.input + " h-10 w-auto"} />
      </FilterBar>

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }}>
        <DataTable<Row>
          columns={columns}
          rows={pageRows}
          rowKey={(row) => row.link.id}
          loading={rows === null && !error}
          error={error}
          onRetry={load}
          emptyVariant={hasFilters ? "filtered" : "empty"}
          emptyIllustration="links"
          emptyTitle={t("empty.links.title")}
          emptyBody={t("empty.links.body")}
          emptyAction={
            <Button onClick={() => navigate("/links/new")}>
              <Plus aria-hidden /> {t("links.empty.cta")}
            </Button>
          }
          onClearFilters={clearAll}
          page={clampedPage}
          pageSize={pageSize}
          total={total}
          onPageChange={(p) => setParam("page", String(p))}
          onPageSizeChange={(s) => setParam("pageSize", String(s))}
          onRowClick={(row) => {
            if (row.era === "v2") navigate(`/links/v2/${row.link.id}`);
            else setLegacyView(row.link as LegacyLink);
          }}
        />
      </motion.div>

      {/* Legacy links: limited read-only view */}
      <Modal open={legacyView !== null} onClose={() => setLegacyView(null)} title={t("links.legacy.readonly.title")}>
        {legacyView && (
          <div className="space-y-3 text-sm">
            <p className="text-text-2">{t("links.legacy.readonly.body")}</p>
            <div className="flex items-center justify-between gap-2">
              <span className={formCls.label}>{t("links.col.identifier")}</span>
              <CopyField value={legacyView.identifier} truncate={false} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={formCls.label}>{t("links.col.summary")}</span>
              <span className="text-text">{legacyView.title[locale] || legacyView.title["pt-BR"]}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={formCls.label}>{t("links.col.amount")}</span>
              <MoneyText money={legacyView.amount} showPair />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={formCls.label}>{t("links.col.status")}</span>
              <LinkLifecycleBadge lifecycle={legacyView.state} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={formCls.label}>{t("links.created")}</span>
              <span className="text-text-2">{formatDateTime(legacyView.createdAt)}</span>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
