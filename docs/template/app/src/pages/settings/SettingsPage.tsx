import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Link2 } from "lucide-react";
import { useI18n } from "@/i18n";
import type { DictKey, Locale } from "@/i18n";
import { useSession } from "@/mock/session";
import { useTheme } from "@/theme/ThemeProvider";
import { THEMES } from "@/theme/ThemeProvider";
import type { ThemeId } from "@/theme/ThemeProvider";
import type { CheckoutDataPolicy, LocalizedText, NauttConnection, StorefrontConfig } from "@/mock/types";
import { merchantSettings, mockLatency, users } from "@/mock/fixtures";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { CardSkeleton } from "@/components/ui/Skeletons";
import { ConfirmDialog } from "@/components/ui/Modal";
import { LocalizedFieldGroup } from "@/components/ui/LocalizedFieldGroup";
import { Monogram } from "@/components/ui/Monogram";
import { cn } from "@/lib/utils";
import { Banner, Field, ImageField, NativeSelect, SectionCard, SegmentedControl, inputCls } from "../catalog/fields";

const SECTIONS = ["connection", "policy", "identity", "store", "payments", "currency", "language"] as const;
type SectionId = (typeof SECTIONS)[number];

const POLICY_FIELDS: Record<CheckoutDataPolicy, string[]> = {
  none: [],
  nameEmail: ["settings.policy.f.name", "settings.policy.f.email"],
  cpf: ["settings.policy.f.name", "settings.policy.f.email", "settings.policy.f.cpf"],
  fullAddress: [
    "settings.policy.f.name",
    "settings.policy.f.email",
    "settings.policy.f.cpf",
    "settings.policy.f.street",
    "settings.policy.f.number",
    "settings.policy.f.district",
    "settings.policy.f.city",
    "settings.policy.f.state",
    "settings.policy.f.postal",
    "settings.policy.f.complement",
  ],
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export default function SettingsPage() {
  const { t, locale, setLocale, formatDateTime } = useI18n();
  const { user } = useSession();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<SectionId>("connection");
  const [savedSection, setSavedSection] = useState<SectionId | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Section 1 — Nautt connection
  const [nautt, setNautt] = useState<NauttConnection>({ status: "not-configured", lastValidatedAt: null });
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<"valid" | "invalid" | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  // Section 2 — policy
  const [policy, setPolicy] = useState<CheckoutDataPolicy>("none");
  const [policyBaseline, setPolicyBaseline] = useState<CheckoutDataPolicy>("none");

  // Section 3 — identity
  const [slug, setSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [displayNames, setDisplayNames] = useState<LocalizedText>({ "pt-BR": "", en: "" });
  const [storeEnabled, setStoreEnabled] = useState(false);
  const [enableBlock, setEnableBlock] = useState<string | null>(null);
  const [toggleOpen, setToggleOpen] = useState(false);

  // Section 4 — store config
  const [layout, setLayout] = useState<"boxed" | "table">("boxed");
  const [accent, setAccent] = useState("#00B8A0");
  const [accentError, setAccentError] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [logoPending, setLogoPending] = useState(false);

  // Section 5 — payments
  const [standalone, setStandalone] = useState(false);
  const [standaloneBaseline, setStandaloneBaseline] = useState(false);

  // Section 6 — default currency
  const [currency, setCurrency] = useState("");
  const [currencyBaseline, setCurrencyBaseline] = useState("");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ms = user ? merchantSettings.find((m) => m.merchantId === user.id) : undefined;
    const timer = setTimeout(() => {
      if (user) {
        setNautt(ms?.nautt ?? { status: "not-configured", lastValidatedAt: null });
        setPolicy(user.storefront.checkoutPolicy);
        setPolicyBaseline(user.storefront.checkoutPolicy);
        setSlug(user.storefront.slug ?? "");
        setDisplayNames({ ...user.storefront.displayName });
        setStoreEnabled(user.storefront.enabled);
        setLayout(user.storefront.layout);
        setAccent(user.storefront.accent);
        setLogo(user.storefront.logoUrl);
        setStandalone(user.storefront.standalonePayments);
        setStandaloneBaseline(user.storefront.standalonePayments);
        setCurrency(user.storefront.defaultCurrency ?? "");
        setCurrencyBaseline(user.storefront.defaultCurrency ?? "");
      }
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [user?.id]);

  // Scroll-spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id as SectionId);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [loading]);

  const persistStorefront = (patch: Partial<StorefrontConfig>) => {
    const fx = users.find((u) => u.id === user?.id);
    if (fx) Object.assign(fx.storefront, patch);
  };

  const flashSaved = (s: SectionId) => {
    setSavedSection(s);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedSection(null), 4000);
  };

  const savedBanner = (s: SectionId) =>
    savedSection === s ? <Banner tone="success" className="mt-4">{t("settings.saved")}</Banner> : null;

  const persistNautt = (n: NauttConnection) => {
    const ms = merchantSettings.find((m) => m.merchantId === user?.id);
    if (ms) ms.nautt = n;
    setNautt(n);
  };

  // --- Section 1 actions ---
  const registerKey = async () => {
    if (!apiKey.trim()) {
      setKeyError(t("settings.conn.keyRequired"));
      return;
    }
    setValidating(true);
    setKeyError(null);
    await mockLatency(800);
    if (apiKey.toLowerCase().includes("invalid")) {
      persistNautt({ status: "invalid", lastValidatedAt: new Date().toISOString() });
      setKeyError(t("settings.conn.invalidCredential"));
    } else {
      persistNautt({ status: "connected", lastValidatedAt: new Date().toISOString() });
      setApiKey("");
      setReplacing(false);
      toast("success", t("settings.conn.registered"));
    }
    setValidating(false);
  };

  const validateNow = async () => {
    setValidating(true);
    setValidateResult(null);
    await mockLatency(800);
    const ok = nautt.status === "connected";
    setValidateResult(ok ? "valid" : "invalid");
    if (ok) persistNautt({ ...nautt, lastValidatedAt: new Date().toISOString() });
    setValidating(false);
  };

  const resetKey = async () => {
    setSaving(true);
    await mockLatency(500);
    persistNautt({ status: "not-configured", lastValidatedAt: null });
    setApiKey("");
    setReplacing(false);
    setValidateResult(null);
    setSaving(false);
    setResetOpen(false);
    toast("success", t("settings.conn.resetDone"));
  };

  // --- Section 2 ---
  const savePolicy = async () => {
    setSaving(true);
    await mockLatency(400);
    persistStorefront({ checkoutPolicy: policy });
    setPolicyBaseline(policy);
    setSaving(false);
    flashSaved("policy");
    toast("success", t("settings.saved"));
  };

  // --- Section 3 ---
  const slugValid = SLUG_RE.test(slug);
  const namesValid = displayNames["pt-BR"].trim().length > 0 && displayNames.en.trim().length > 0;
  const identityDirty =
    slug !== (user?.storefront.slug ?? "") ||
    displayNames["pt-BR"] !== user?.storefront.displayName["pt-BR"] ||
    displayNames.en !== user?.storefront.displayName.en;

  const checkSlug = (v: string) => {
    setSlug(v);
    if (!v) return setSlugError(null);
    if (!SLUG_RE.test(v)) return setSlugError(t("settings.identity.slugInvalid"));
    if (users.some((u) => u.id !== user?.id && u.storefront.slug === v)) return setSlugError(t("settings.identity.slugTaken"));
    setSlugError(null);
  };

  const saveIdentity = async () => {
    if (slug && !slugValid) {
      setSlugError(t("settings.identity.slugInvalid"));
      return;
    }
    setSaving(true);
    await mockLatency(400);
    persistStorefront({ slug: slug || null, displayName: { ...displayNames } });
    setSaving(false);
    flashSaved("identity");
    toast("success", t("settings.saved"));
  };

  const confirmToggle = async () => {
    if (!storeEnabled) {
      // enabling — guard invalid configuration
      const missing: string[] = [];
      if (!slugValid) missing.push(t("settings.identity.missingSlug"));
      if (!namesValid) missing.push(t("settings.identity.missingName"));
      if (missing.length > 0) {
        setEnableBlock(t("settings.identity.missing", { items: missing.join(" · ") }));
        setToggleOpen(false);
        return;
      }
    }
    setEnableBlock(null);
    setSaving(true);
    await mockLatency(400);
    const next = !storeEnabled;
    persistStorefront({ enabled: next });
    setStoreEnabled(next);
    setSaving(false);
    setToggleOpen(false);
    toast("success", t("settings.saved"));
  };

  // --- Section 4 ---
  const saveStore = async () => {
    if (!HEX_RE.test(accent)) {
      setAccentError(t("settings.store.accentInvalid"));
      return;
    }
    setAccentError(null);
    setSaving(true);
    await mockLatency(400);
    persistStorefront({ theme, layout, accent, logoUrl: logo });
    setLogoPending(false);
    setSaving(false);
    flashSaved("store");
    toast("success", t("settings.saved"));
  };

  // --- Section 5 ---
  const savePayments = async () => {
    setSaving(true);
    await mockLatency(400);
    persistStorefront({ standalonePayments: standalone });
    setStandaloneBaseline(standalone);
    setSaving(false);
    flashSaved("payments");
    toast("success", t("settings.saved"));
  };

  // --- Section 6 ---
  const activeCurrencies = (merchantSettings.find((m) => m.merchantId === user?.id)?.supportedCurrencies ?? []).filter((c) => c.active);
  const saveCurrency = async (cleared = false) => {
    setSaving(true);
    await mockLatency(400);
    const value = cleared ? "" : currency;
    persistStorefront({ defaultCurrency: value || null });
    setCurrency(value);
    setCurrencyBaseline(value);
    setSaving(false);
    flashSaved("currency");
    toast("success", t("settings.saved"));
  };

  // --- Section 7 ---
  const changeLocale = (l: Locale) => {
    setLocale(l);
    persistStorefront({});
    const fx = users.find((u) => u.id === user?.id);
    if (fx) fx.locale = l;
    flashSaved("language");
    toast("success", t("settings.lang.saved"));
  };

  const connBadge =
    nautt.status === "connected" ? (
      <span className="rounded-pill bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">{t("settings.conn.connected")}</span>
    ) : nautt.status === "invalid" ? (
      <span className="rounded-pill bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-danger">{t("settings.conn.invalid")}</span>
    ) : (
      <span className="rounded-pill bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-text-2">{t("settings.conn.notConfigured")}</span>
    );

  if (loading)
    return (
      <div className="space-y-4">
        <div className="skeleton-shimmer h-8 w-48 rounded-md" />
        <div className="grid gap-4">
          {SECTIONS.slice(0, 4).map((s) => (
            <CardSkeleton key={s} />
          ))}
        </div>
      </div>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      {/* Sticky anchor nav with scroll-spy */}
      <nav className="hidden lg:block">
        <div className="sticky top-20 space-y-1">
          {SECTIONS.map((id) => (
            <a
              key={id}
              href={`#${id}`}
              className={cn(
                "block rounded-md border-l-2 px-3 py-1.5 text-sm transition-colors",
                active === id
                  ? "border-accent bg-accent-soft font-medium text-text"
                  : "border-transparent text-text-3 hover:text-text-2",
              )}
            >
              {t(`settings.nav.${id}`)}
            </a>
          ))}
        </div>
      </nav>

      <div className="space-y-5">
        <h1 className="font-display text-2xl leading-8 font-semibold text-text">{t("settings.title")}</h1>

        {/* Section 1 — Nautt connection */}
        <SectionCard id="connection" title={t("settings.conn.title")} description={t("settings.conn.desc")}>
          <div className="flex flex-wrap items-center gap-3">
            {connBadge}
            {nautt.status === "connected" && nautt.lastValidatedAt && (
              <span className="text-xs text-text-3">{t("settings.conn.lastValidated", { date: formatDateTime(nautt.lastValidatedAt) })}</span>
            )}
          </div>

          <div className="mt-4">
            {nautt.status !== "not-configured" && !replacing ? (
              <div className="space-y-3">
                <div>
                  <input className={`${inputCls} font-money`} value="••••••••" disabled readOnly aria-label={t("settings.conn.apiKey")} />
                  <p className="mt-1.5 text-xs text-text-3">{t("settings.conn.storedSecurely")}</p>
                </div>
                {validateResult === "invalid" && <Banner tone="danger">{t("settings.conn.invalidCredential")}</Banner>}
                {validateResult === "valid" && <Banner tone="success">{t("settings.conn.valid")}</Banner>}
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setReplacing(true)}>
                    {t("settings.conn.replace")}
                  </Button>
                  <Button variant="secondary" onClick={validateNow} disabled={validating}>
                    {validating ? t("common.loading") : t("settings.conn.validate")}
                  </Button>
                  <Button variant="ghost" className="text-danger" onClick={() => setResetOpen(true)}>
                    {t("settings.conn.reset")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Field label={t("settings.conn.apiKey")} htmlFor="nautt-key" error={keyError}>
                  <div className="relative">
                    <input
                      id="nautt-key"
                      type={showKey ? "text" : "password"}
                      className={`${inputCls} pr-10 font-money`}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      aria-label={showKey ? t("auth.hidePassword") : t("auth.showPassword")}
                      onClick={() => setShowKey((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-3 hover:text-text"
                    >
                      {showKey ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                    </button>
                  </div>
                </Field>
                <div className="flex gap-2">
                  <Button onClick={registerKey} disabled={validating}>
                    {validating ? t("common.loading") : t("settings.conn.register")}
                  </Button>
                  {replacing && (
                    <Button variant="ghost" onClick={() => { setReplacing(false); setApiKey(""); setKeyError(null); }}>
                      {t("common.cancel")}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
          {savedBanner("connection")}
        </SectionCard>

        {/* Section 2 — Checkout data policy */}
        <SectionCard id="policy" title={t("settings.policy.title")} description={t("settings.policy.desc")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(POLICY_FIELDS) as CheckoutDataPolicy[]).map((p) => {
              const selected = policy === p;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPolicy(p)}
                  className={cn(
                    "rounded-card border bg-surface p-4 text-left transition-colors",
                    selected ? "border-accent ring-[3px] ring-[var(--ring-color)]" : "border-border hover:border-accent/50",
                  )}
                >
                  <p className="text-sm font-medium text-text">{t(`settings.policy.${p === "nameEmail" ? "nameEmail" : p === "cpf" ? "cpf" : p === "fullAddress" ? "fullAddress" : "none"}`)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {POLICY_FIELDS[p].length === 0 ? (
                      <span className="text-xs text-text-3">—</span>
                    ) : (
                      POLICY_FIELDS[p].map((k) => (
                        <span key={k} className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-2">
                          {t(k as DictKey)}
                        </span>
                      ))
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={savePolicy} disabled={saving || policy === policyBaseline}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </div>
          {savedBanner("policy")}
        </SectionCard>

        {/* Section 3 — Store identity */}
        <SectionCard id="identity" title={t("settings.identity.title")}>
          <div className="space-y-5">
            <Field label={t("settings.identity.slug")} htmlFor="store-slug" error={slugError} helper={t("settings.identity.slugCaption", { slug: slug || "…" })}>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-border bg-surface-2 px-2.5 py-2 font-money text-xs text-text-3">/loja/</span>
                <input
                  id="store-slug"
                  className={`${inputCls} font-money`}
                  value={slug}
                  onChange={(e) => checkSlug(e.target.value)}
                  placeholder="minha-loja"
                />
              </div>
            </Field>
            <LocalizedFieldGroup id="store-names" label={t("settings.identity.displayNames")} value={displayNames} onChange={setDisplayNames} required />
            {enableBlock && <Banner tone="danger">{enableBlock}</Banner>}
            <div className="flex items-center justify-between gap-4 rounded-card border border-border bg-surface-2 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-text">{t("settings.identity.enabled")}</p>
                <p className="text-xs text-text-3">{storeEnabled ? t("status.active") : t("status.inactive")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={storeEnabled}
                onClick={() => setToggleOpen(true)}
                className={cn(
                  "relative h-6 w-11 rounded-full transition-colors",
                  storeEnabled ? "bg-accent" : "bg-border",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
                    storeEnabled ? "translate-x-[22px]" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveIdentity} disabled={saving || !identityDirty}>
                {saving ? t("common.loading") : t("common.save")}
              </Button>
            </div>
          </div>
          {savedBanner("identity")}
        </SectionCard>

        {/* Section 4 — Store configuration */}
        <SectionCard id="store" title={t("settings.store.title")}>
          <div className="grid gap-6 xl:grid-cols-[1fr_260px]">
            <div className="space-y-5">
              <Field label={t("settings.store.theme")}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {THEMES.map((id: ThemeId) => {
                    const selected = theme === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setTheme(id)}
                        className={cn(
                          "rounded-card border p-1.5 text-left transition-colors",
                          selected ? "border-accent ring-[3px] ring-[var(--ring-color)]" : "border-border hover:border-accent/50",
                        )}
                      >
                        <img src={`/theme-swatch-${id}.svg`} alt="" className="w-full rounded-md" />
                        <p className="mt-1.5 px-1 text-xs font-medium text-text">{t(`theme.${id}`)}</p>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label={t("settings.store.layout")}>
                <SegmentedControl
                  ariaLabel={t("settings.store.layout")}
                  value={layout}
                  onChange={(v) => setLayout(v as "boxed" | "table")}
                  options={[
                    { value: "boxed", label: t("settings.store.layoutBoxed") },
                    { value: "table", label: t("settings.store.layoutTable") },
                  ]}
                />
              </Field>

              <Field label={t("settings.store.accent")} htmlFor="store-accent" error={accentError}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={HEX_RE.test(accent) ? accent : "#000000"}
                    onChange={(e) => setAccent(e.target.value)}
                    aria-label={t("settings.store.accent")}
                    className="h-10 w-12 cursor-pointer rounded-md border border-border bg-surface p-1"
                  />
                  <input
                    id="store-accent"
                    className={`${inputCls} font-money uppercase`}
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                    placeholder="#00B8A0"
                  />
                </div>
              </Field>

              <Field label={t("settings.store.logo")} optional>
                <div className="flex items-center gap-3">
                  <ImageField
                    value={logo}
                    onChange={(url) => {
                      setLogo(url);
                      setLogoPending(true);
                    }}
                  />
                  {logoPending && logo && (
                    <span className="rounded-pill bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                      {t("settings.store.logoPending")}
                    </span>
                  )}
                </div>
              </Field>

              <div className="flex justify-end">
                <Button onClick={saveStore} disabled={saving}>
                  {saving ? t("common.loading") : t("common.save")}
                </Button>
              </div>
            </div>

            {/* Live preview */}
            <div className="xl:sticky xl:top-20 xl:self-start">
              <div className="rounded-card border border-border bg-bg p-4 shadow-card transition-all duration-150">
                <p className="text-xs font-medium text-text-3">{t("settings.store.preview")}</p>
                <div className="mx-auto mt-3 max-w-[220px] rounded-card border border-border bg-surface p-4 shadow-card">
                  <div className="flex items-center gap-2.5">
                    {logo ? (
                      <img src={logo} alt="" className="size-9 rounded-full border border-border object-cover" />
                    ) : (
                      <Monogram name={displayNames[locale] || "?"} size={36} />
                    )}
                    <p className="truncate text-sm font-semibold text-text">{displayNames[locale] || "—"}</p>
                  </div>
                  <div className={cn("mt-3", layout === "boxed" ? "rounded-md border border-border bg-surface-2 p-2" : "border-y border-border py-2")}>
                    <div className="h-2 w-3/4 rounded bg-border" />
                    <div className="mt-1.5 h-2 w-1/2 rounded bg-border" />
                  </div>
                  <div className="mt-3 h-8 rounded-md" style={{ backgroundColor: HEX_RE.test(accent) ? accent : "var(--accent)" }} />
                </div>
                <p className="mt-2 text-[11px] text-text-3">{t("settings.store.previewCaption")}</p>
              </div>
            </div>
          </div>
          {savedBanner("store")}
        </SectionCard>

        {/* Section 5 — Payments */}
        <SectionCard id="payments" title={t("settings.payments.title")}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-text">{t("settings.payments.toggle")}</p>
              <p className="mt-0.5 text-sm text-text-2">{t("settings.payments.desc")}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={standalone}
              onClick={() => setStandalone((s) => !s)}
              className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", standalone ? "bg-accent" : "bg-border")}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
                  standalone ? "translate-x-[22px]" : "translate-x-0.5",
                )}
              />
            </button>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={savePayments} disabled={saving || standalone === standaloneBaseline}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </div>
          {savedBanner("payments")}
        </SectionCard>

        {/* Section 6 — Default currency */}
        <SectionCard id="currency" title={t("settings.currency.title")} description={t("settings.currency.desc")}>
          {activeCurrencies.length === 0 ? (
            <Banner tone="warning">
              <p className="font-medium">{t("settings.currency.noSupported")}</p>
              <p className="mt-0.5">{t("settings.currency.noSupportedBody")}</p>
            </Banner>
          ) : (
            <div className="space-y-4">
              <Field label={t("settings.currency.label")} htmlFor="default-currency">
                <NativeSelect
                  id="default-currency"
                  value={currency}
                  onChange={setCurrency}
                  options={[
                    { value: "", label: t("settings.currency.none") },
                    ...activeCurrencies.map((c) => ({ value: c.code, label: c.code })),
                  ]}
                />
              </Field>
              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" size="sm" onClick={() => saveCurrency(true)} disabled={saving || currencyBaseline === ""}>
                  {t("settings.currency.clear")}
                </Button>
                <Button onClick={() => saveCurrency(false)} disabled={saving || currency === currencyBaseline}>
                  {saving ? t("common.loading") : t("common.save")}
                </Button>
              </div>
            </div>
          )}
          {savedBanner("currency")}
        </SectionCard>

        {/* Section 7 — Language */}
        <SectionCard id="language" title={t("settings.lang.title")} description={t("settings.lang.desc")}>
          <div className="flex items-center gap-2">
            <Link2 className="size-4 text-text-3" aria-hidden />
            <SegmentedControl
              ariaLabel={t("settings.lang.title")}
              value={locale}
              onChange={(l) => changeLocale(l as Locale)}
              options={[
                { value: "pt-BR", label: "PT-BR" },
                { value: "en", label: "EN" },
              ]}
            />
          </div>
          {savedBanner("language")}
        </SectionCard>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={resetKey}
        title={t("settings.conn.resetTitle")}
        body={t("settings.conn.resetBody")}
        confirmLabel={t("settings.conn.reset")}
        loading={saving}
      />
      <ConfirmDialog
        open={toggleOpen}
        onClose={() => setToggleOpen(false)}
        onConfirm={confirmToggle}
        title={t("settings.identity.toggleTitle")}
        body={storeEnabled ? t("settings.identity.disableBody") : t("settings.identity.enableBody")}
        destructive={storeEnabled}
        confirmLabel={t("common.confirm")}
        loading={saving}
      />
    </div>
  );
}
