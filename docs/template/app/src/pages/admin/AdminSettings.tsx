import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { CopyField } from "@/components/ui/CopyField";
import { Switch } from "@/components/ui/switch";
import { CardSkeleton } from "@/components/ui/Skeletons";
import type { CurrencyPairRecord, ExchangeCurrencyMapping, PaymentMethodRecord } from "@/mock/types";
import type { ThemeId } from "@/theme/ThemeProvider";
import { adminPlatformConfig, mockLatency } from "@/mock/fixtures";
import { AdminField, cardCls, fadeUp, inputCls, useMockQuery } from "./shared";

const THEMES: ThemeId[] = ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"];
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SECTIONS = ["currencies", "pairs", "methods", "globalPayments", "appearance", "language"] as const;
type SectionId = (typeof SECTIONS)[number];

function StatusPill({ active }: { active: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-medium ${active ? "bg-success-soft text-success" : "bg-surface-2 text-text-2"}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {t(active ? "status.active" : "status.inactive")}
    </span>
  );
}

function SuccessBanner({ show }: { show: boolean }) {
  const { t } = useI18n();
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.16 }}
          className="overflow-hidden"
        >
          <div className="mb-3 flex items-center gap-2 rounded-md border border-success/40 bg-success-soft px-3 py-2 text-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden />
            {t("admin.savedBanner")}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function useSavedBanner() {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = () => {
    setShow(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 4000);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { show, flash };
}

export default function AdminSettings() {
  const { t } = useI18n();
  const [active, setActive] = useState<SectionId>("currencies");
  const { data, loading, error, retry } = useMockQuery(async () => {
    await mockLatency(500);
    return adminPlatformConfig;
  }, []);

  useEffect(() => {
    const onScroll = () => {
      for (const s of [...SECTIONS].reverse()) {
        const el = document.getElementById(`sec-${s}`);
        if (el && el.getBoundingClientRect().top <= 120) {
          setActive(s);
          return;
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (s: SectionId) => {
    document.getElementById(`sec-${s}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(s);
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl leading-8 font-semibold tracking-[-0.02em] text-text">{t("admin.settingsTitle")}</h1>
      <div className="flex gap-6">
        <nav className="sticky top-20 hidden h-fit w-[200px] shrink-0 space-y-1 lg:block" aria-label={t("admin.settingsTitle")}>
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => scrollTo(s)}
              className={`relative block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${active === s ? "bg-accent-soft font-medium text-text" : "text-text-2 hover:bg-surface-2"}`}
            >
              {active === s && <motion.span layoutId="settings-anchor" className="absolute left-0 top-1 bottom-1 w-[3px] rounded bg-accent" transition={{ duration: 0.16 }} />}
              {t(`admin.sec.${s}`)}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          {loading ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : error || !data ? (
            <div className="flex items-center justify-between gap-3 rounded-card border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
              {t("common.requestError")}
              <Button variant="secondary" size="sm" onClick={retry}>
                {t("common.retry")}
              </Button>
            </div>
          ) : (
            <>
              <CurrenciesSection config={data} />
              <PairsSection config={data} />
              <MethodsSection config={data} />
              <GlobalPaymentsSection config={data} />
              <AppearanceSection config={data} />
              <LanguageSection />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionShell({
  id,
  titleKey,
  descKey,
  index,
  children,
}: {
  id: SectionId;
  titleKey: `admin.sec.${SectionId}`;
  descKey: `admin.sec.${SectionId}Desc`;
  index: number;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <motion.section id={`sec-${id}`} {...fadeUp(index)} className={`${cardCls} scroll-mt-20`}>
      <h2 className="font-display text-lg leading-[26px] font-semibold text-text">{t(titleKey)}</h2>
      <p className="mt-1 text-sm text-text-2">{t(descKey)}</p>
      <div className="mt-4">{children}</div>
    </motion.section>
  );
}

/* ---------------- Section 1 — Exchange currencies ------------------ */

function CurrenciesSection({ config }: { config: typeof adminPlatformConfig }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const banner = useSavedBanner();
  const [items, setItems] = useState<ExchangeCurrencyMapping[]>([...config.exchangeCurrencies]);
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState("");
  const [curId, setCurId] = useState("");
  const [excId, setExcId] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [pending, setPending] = useState<ExchangeCurrencyMapping | null>(null);
  const [blocked, setBlocked] = useState<ExchangeCurrencyMapping | null>(null);

  const add = async () => {
    setFormErr(null);
    if (!/^[A-Z]{3}$/.test(code)) return setFormErr(t("admin.codeInvalid"));
    if (!UUID_RE.test(curId) || !UUID_RE.test(excId)) return setFormErr(t("admin.uuidInvalid"));
    if (items.some((i) => i.code === code)) return setFormErr(t("admin.duplicateCode"));
    await mockLatency(500);
    const rec: ExchangeCurrencyMapping = { id: `ec_${Date.now().toString(36)}`, code, nauttCurrencyId: curId, nauttExchangeCurrencyId: excId, status: "active", inUseBy: [] };
    config.exchangeCurrencies.push(rec);
    setItems([...config.exchangeCurrencies]);
    setAdding(false);
    setCode("");
    setCurId("");
    setExcId("");
    banner.flash();
  };

  const toggle = (m: ExchangeCurrencyMapping) => {
    if (m.status === "active" && m.inUseBy.length > 0) {
      setBlocked(m);
      return;
    }
    setPending(m);
  };

  const confirmToggle = async () => {
    if (!pending) return;
    await mockLatency(400);
    pending.status = pending.status === "active" ? "inactive" : "active";
    setItems([...config.exchangeCurrencies]);
    setPending(null);
    banner.flash();
  };

  return (
    <SectionShell id="currencies" titleKey="admin.sec.currencies" descKey="admin.sec.currenciesDesc" index={0}>
      <SuccessBanner show={banner.show} />
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-2">{t("admin.emptyCurrencies")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-text-3">
              <th className="py-2 pr-3">{t("admin.col.code")}</th>
              <th className="py-2 pr-3">{t("admin.col.nauttCurrency")}</th>
              <th className="py-2 pr-3">{t("admin.col.exchangeCurrency")}</th>
              <th className="py-2 pr-3">{t("admin.col.status")}</th>
              <th className="py-2 text-right">{t("admin.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="py-2.5 pr-3 font-money font-medium text-text">{m.code}</td>
                <td className="py-2.5 pr-3"><CopyField value={m.nauttCurrencyId} className="max-w-40" /></td>
                <td className="py-2.5 pr-3"><CopyField value={m.nauttExchangeCurrencyId} className="max-w-40" /></td>
                <td className="py-2.5 pr-3"><StatusPill active={m.status === "active"} /></td>
                <td className="py-2.5 text-right">
                  <Button variant="secondary" size="sm" onClick={() => toggle(m)}>
                    {m.status === "active" ? t("admin.deactivate") : t("admin.activate")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding ? (
        <div className="mt-4 rounded-md border border-border bg-surface-2 p-4">
          {formErr && <p className="mb-2 text-xs font-medium text-danger">{formErr}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <AdminField label={t("admin.currencyCode")} htmlFor="ec-code">
              <input id="ec-code" className={`${inputCls} font-money uppercase`} maxLength={3} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </AdminField>
            <AdminField label={t("admin.col.nauttCurrency")} htmlFor="ec-cur">
              <input id="ec-cur" className={`${inputCls} font-money`} value={curId} onChange={(e) => setCurId(e.target.value)} placeholder="00000000-0000-4000-8000-000000000000" />
            </AdminField>
            <AdminField label={t("admin.col.exchangeCurrency")} htmlFor="ec-exc">
              <input id="ec-exc" className={`${inputCls} font-money`} value={excId} onChange={(e) => setExcId(e.target.value)} placeholder="00000000-0000-4000-8000-000000000000" />
            </AdminField>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void add()}>{t("admin.add")}</Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {t("admin.add")}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => void confirmToggle()}
        title={pending?.status === "active" ? t("admin.confirmDeactivateTitle") : t("admin.activate")}
        body={pending?.status === "active" ? t("admin.confirmDeactivateBody") : pending?.code}
        destructive={pending?.status === "active"}
      />
      <ConfirmDialog
        open={blocked !== null}
        onClose={() => setBlocked(null)}
        onConfirm={() => {
          setBlocked(null);
          toast("info", t("admin.inUseTitle"));
        }}
        title={t("admin.inUseTitle")}
        body={t("admin.inUseBody", { where: blocked?.inUseBy.join(", ") ?? "" })}
        confirmLabel={t("common.close")}
        destructive={false}
      />
    </SectionShell>
  );
}

/* --------- Sections 2 & 3 — pairs / methods (same pattern) --------- */

function NamedRecordsSection({
  id,
  titleKey,
  descKey,
  index,
  items,
  addLabel,
  nameLabel,
  onAdd,
  chipName,
}: {
  id: SectionId;
  titleKey: `admin.sec.${SectionId}`;
  descKey: `admin.sec.${SectionId}Desc`;
  index: number;
  items: Array<CurrencyPairRecord | PaymentMethodRecord>;
  addLabel: string;
  nameLabel: string;
  onAdd: (name: string) => Promise<"ok" | "conflict">;
  chipName?: (name: string) => boolean;
}) {
  const { t, formatDate } = useI18n();
  const banner = useSavedBanner();
  const [, force] = useState(0);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pending, setPending] = useState<(typeof items)[number] | null>(null);
  const [blocked, setBlocked] = useState<(typeof items)[number] | null>(null);

  const add = async () => {
    if (!name.trim()) return setErr(t("auth.required"));
    const res = await onAdd(name.trim());
    if (res === "conflict") return setErr(t("admin.duplicateCode"));
    setAdding(false);
    setName("");
    setErr(null);
    force((n) => n + 1);
    banner.flash();
  };

  const saveRename = async (rec: (typeof items)[number]) => {
    await mockLatency(400);
    if (items.some((i) => i.id !== rec.id && i.name.toLowerCase() === editName.trim().toLowerCase())) {
      setErr(t("admin.renameConflict"));
      return;
    }
    rec.name = editName.trim();
    setEditId(null);
    setErr(null);
    banner.flash();
  };

  const toggle = (rec: (typeof items)[number]) => {
    if (rec.status === "active" && rec.inUseBy.length > 0) setBlocked(rec);
    else setPending(rec);
  };

  const confirmToggle = async () => {
    if (!pending) return;
    await mockLatency(400);
    pending.status = pending.status === "active" ? "inactive" : "active";
    setPending(null);
    force((n) => n + 1);
    banner.flash();
  };

  return (
    <SectionShell id={id} titleKey={titleKey} descKey={descKey} index={index}>
      <SuccessBanner show={banner.show} />
      {err && <p className="mb-2 text-xs font-medium text-danger">{err}</p>}
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-2">{t("admin.emptyRecords")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-text-3">
              <th className="py-2 pr-3">{t("admin.col.name")}</th>
              <th className="py-2 pr-3">{t("admin.col.created")}</th>
              <th className="py-2 pr-3">{t("admin.col.status")}</th>
              <th className="py-2 text-right">{t("admin.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((rec) => (
              <tr key={rec.id} className="border-t border-border">
                <td className="py-2.5 pr-3">
                  {editId === rec.id ? (
                    <span className="flex items-center gap-2">
                      <input className={`${inputCls} font-money`} value={editName} onChange={(e) => setEditName(e.target.value)} aria-label={t("admin.rename")} />
                      <Button size="sm" onClick={() => void saveRename(rec)}>{t("common.save")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>{t("common.cancel")}</Button>
                    </span>
                  ) : chipName?.(rec.name) ? (
                    <span className="rounded-pill bg-accent-soft px-2.5 py-0.5 font-money text-xs font-medium text-text">{rec.name}</span>
                  ) : (
                    <span className="font-medium text-text">{rec.name}</span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-xs text-text-2">{formatDate(rec.createdAt)}</td>
                <td className="py-2.5 pr-3"><StatusPill active={rec.status === "active"} /></td>
                <td className="py-2.5 text-right">
                  <span className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setEditId(rec.id); setEditName(rec.name); setErr(null); }}>
                      {t("admin.rename")}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => toggle(rec)}>
                      {rec.status === "active" ? t("admin.deactivate") : t("admin.activate")}
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding ? (
        <div className="mt-4 flex items-end gap-2 rounded-md border border-border bg-surface-2 p-4">
          <div className="flex-1">
            <AdminField label={nameLabel} htmlFor={`add-${id}`}>
              <input id={`add-${id}`} className={`${inputCls} font-money`} value={name} onChange={(e) => setName(e.target.value)} />
            </AdminField>
          </div>
          <Button onClick={() => void add()}>{t("admin.add")}</Button>
          <Button variant="ghost" onClick={() => setAdding(false)}>{t("common.cancel")}</Button>
        </div>
      ) : (
        <div className="mt-4">
          <Button variant="secondary" onClick={() => setAdding(true)}>{addLabel}</Button>
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => void confirmToggle()}
        title={pending?.status === "active" ? t("admin.confirmDeactivateTitle") : t("admin.activate")}
        body={pending?.status === "active" ? t("admin.confirmDeactivateBody") : pending?.name}
        destructive={pending?.status === "active"}
      />
      <ConfirmDialog
        open={blocked !== null}
        onClose={() => setBlocked(null)}
        onConfirm={() => setBlocked(null)}
        title={t("admin.inUseTitle")}
        body={t("admin.inUseBody", { where: blocked?.inUseBy.join(", ") ?? "" })}
        confirmLabel={t("common.close")}
        destructive={false}
      />
    </SectionShell>
  );
}

function PairsSection({ config }: { config: typeof adminPlatformConfig }) {
  const { t } = useI18n();
  const onAdd = async (name: string) => {
    await mockLatency(400);
    if (config.currencyPairs.some((p) => p.name.toLowerCase() === name.toLowerCase())) return "conflict" as const;
    config.currencyPairs.push({ id: `cp_${Date.now().toString(36)}`, name, status: "active", createdAt: new Date().toISOString(), inUseBy: [] });
    return "ok" as const;
  };
  return (
    <NamedRecordsSection
      id="pairs"
      titleKey="admin.sec.pairs"
      descKey="admin.sec.pairsDesc"
      index={1}
      items={config.currencyPairs}
      addLabel={t("admin.newPair")}
      nameLabel={t("admin.pairName")}
      onAdd={onAdd}
      chipName={() => true}
    />
  );
}

function MethodsSection({ config }: { config: typeof adminPlatformConfig }) {
  const { t } = useI18n();
  const onAdd = async (name: string) => {
    await mockLatency(400);
    if (config.paymentMethods.some((p) => p.name.toLowerCase() === name.toLowerCase())) return "conflict" as const;
    config.paymentMethods.push({ id: `pm_${Date.now().toString(36)}`, name, status: "active", createdAt: new Date().toISOString(), inUseBy: [] });
    return "ok" as const;
  };
  return (
    <NamedRecordsSection
      id="methods"
      titleKey="admin.sec.methods"
      descKey="admin.sec.methodsDesc"
      index={2}
      items={config.paymentMethods}
      addLabel={t("admin.newMethod")}
      nameLabel={t("admin.methodName")}
      onAdd={onAdd}
    />
  );
}

/* ---------------- Section 4 — Global payment settings --------------- */

function GlobalPaymentsSection({ config }: { config: typeof adminPlatformConfig }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [, force] = useState(0);
  const [pending, setPending] = useState<(typeof config.globalPayments)[number] | null>(null);

  const sorted = [...config.globalPayments].sort((a, b) => Number(b.primary ?? false) - Number(a.primary ?? false));

  const toggle = async (row: (typeof config.globalPayments)[number]) => {
    if (row.enabled && row.inUse) {
      setPending(row);
      return;
    }
    await mockLatency(400);
    row.enabled = !row.enabled;
    force((n) => n + 1);
    toast("success", t("admin.savedBanner"));
  };

  const confirmOff = async () => {
    if (!pending) return;
    await mockLatency(400);
    pending.enabled = false;
    setPending(null);
    force((n) => n + 1);
    toast("success", t("admin.savedBanner"));
  };

  return (
    <SectionShell id="globalPayments" titleKey="admin.sec.globalPayments" descKey="admin.sec.globalPaymentsDesc" index={3}>
      <ul className="divide-y divide-border">
        {sorted.map((row) => {
          const disabled = !row.dependencyAvailable;
          return (
            <li key={row.id} className="flex items-center gap-3 py-3" title={disabled ? t("admin.dependencyUnavailable") : undefined}>
              <span className="font-medium text-text">{row.name}</span>
              <span className="rounded-pill bg-surface-2 px-2 py-0.5 font-money text-[11px] font-medium text-text-2">
                {row.kind === "currency" ? row.name : `${row.name}`}
              </span>
              {row.primary && <span className="text-xs text-text-3">{t("admin.primaryCaption")}</span>}
              {disabled && <span className="rounded-pill bg-info-soft px-2 py-0.5 text-xs text-info">{t("admin.dependencyUnavailable")}</span>}
              <span className="ml-auto">
                <Switch
                  checked={row.enabled}
                  disabled={disabled}
                  onCheckedChange={() => void toggle(row)}
                  aria-label={row.name}
                />
              </span>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => void confirmOff()}
        title={t("admin.toggleOffTitle", { name: pending?.name ?? "" })}
        body={t("admin.toggleOffBody")}
      />
    </SectionShell>
  );
}

/* ----------------------- Section 5 — Appearance --------------------- */

function AppearanceSection({ config }: { config: typeof adminPlatformConfig }) {
  const { t } = useI18n();
  const banner = useSavedBanner();
  const [theme, setTheme] = useState<ThemeId>(config.defaultTheme);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await mockLatency(500);
    config.defaultTheme = theme;
    setSaving(false);
    banner.flash();
  };

  return (
    <SectionShell id="appearance" titleKey="admin.sec.appearance" descKey="admin.sec.appearanceDesc" index={4}>
      <SuccessBanner show={banner.show} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {THEMES.map((th) => {
          const selected = theme === th;
          return (
            <button
              key={th}
              type="button"
              aria-pressed={selected}
              onClick={() => setTheme(th)}
              className={`relative rounded-card border p-1.5 text-left transition-shadow ${selected ? "border-accent shadow-[0_0_0_3px_var(--ring-color)]" : "border-border hover:border-text-3"}`}
            >
              {selected && <CheckCircle2 className="absolute right-2 top-2 size-4 text-accent" aria-hidden />}
              <img src={`/theme-swatch-${th}.svg`} alt="" width={96} height={64} className="w-full rounded-md" />
              <span className="mt-1 block text-xs font-medium text-text-2">{t(`theme.${th}`)}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={() => void save()} disabled={saving || theme === config.defaultTheme}>
          {saving ? t("common.loading") : t("common.save")}
        </Button>
      </div>
    </SectionShell>
  );
}

/* ------------------------ Section 6 — Language ---------------------- */

function LanguageSection() {
  const { t, locale, setLocale } = useI18n();
  const { toast } = useToast();
  return (
    <SectionShell id="language" titleKey="admin.sec.language" descKey="admin.sec.languageDesc" index={5}>
      <div className="flex gap-1 rounded-md bg-surface-2 p-1 w-fit">
        {(["pt-BR", "en"] as const).map((l) => {
          const selected = locale === l;
          return (
            <button
              key={l}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setLocale(l);
                toast("success", t("admin.languageSaved"));
              }}
              className={`relative rounded px-4 py-1.5 text-xs font-semibold uppercase transition-colors ${selected ? "text-text" : "text-text-3 hover:text-text-2"}`}
            >
              {selected && <motion.span layoutId="admin-lang" className="absolute inset-0 rounded bg-surface shadow-card" transition={{ duration: 0.16 }} />}
              <span className="relative">{l === "pt-BR" ? "PT-BR" : "EN"}</span>
            </button>
          );
        })}
      </div>
    </SectionShell>
  );
}
