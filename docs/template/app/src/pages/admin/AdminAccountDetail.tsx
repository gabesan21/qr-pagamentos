import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "@/i18n";
import type { Locale } from "@/i18n";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/button";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { CopyField } from "@/components/ui/CopyField";
import { LocalizedFieldGroup } from "@/components/ui/LocalizedFieldGroup";
import { SimpleTabs } from "@/components/ui/SimpleTabs";
import { AccountStateBadge } from "@/components/ui/StatusBadge";
import { DetailSkeleton } from "@/components/ui/Skeletons";
import { Monogram } from "@/components/ui/Monogram";
import type { ThemeId } from "@/theme/ThemeProvider";
import type { Role, LocalizedText, User } from "@/mock/types";
import { adminPlatformConfig, mockLatency, users } from "@/mock/fixtures";
import { DataUnavailable } from "./unavailable";
import { AdminField, SegmentedControl, cardCls, fadeUp, inputCls, useMockQuery } from "./shared";

const THEMES: ThemeId[] = ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"];

type Policy = "none" | "nameEmail" | "nameEmailCpf" | "fullAddress";

export default function AdminAccountDetail() {
  const { id } = useParams();
  const { t, formatDateTime } = useI18n();
  const { data, loading, error, retry } = useMockQuery(async () => {
    await mockLatency(500);
    return users.find((u) => u.id === id) ?? null;
  }, [id]);
  const [version, setVersion] = useState(0);

  if (loading) return <DetailSkeleton />;
  if (error) return <DataUnavailable kind="error" onRetry={retry} />;
  const user = data;
  if (!user) return <DataUnavailable kind="unavailable" backTo="/admin/accounts" backLabel={t("common.back")} />;

  const refresh = () => setVersion((v) => v + 1);
  void version;

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1 text-sm text-text-3" aria-label="breadcrumb">
        <Link to="/admin/accounts" className="hover:text-text">
          {t("admin.usersTitle")}
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className={`font-money text-text ${user.state === "deleted" ? "line-through" : ""}`}>{user.username}</span>
      </nav>

      <header className="flex flex-wrap items-center gap-3">
        <Monogram name={user.username} size={48} />
        <div>
          <h1 className={`font-display text-2xl leading-8 font-semibold tracking-[-0.02em] text-text ${user.state === "deleted" ? "line-through" : ""}`}>
            {user.username}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded-pill px-2 py-0.5 text-xs font-medium ${user.role === "ADMIN" ? "bg-accent-soft text-text" : "bg-surface-2 text-text-2"}`}>
              {t(user.role === "ADMIN" ? "role.ADMIN" : "role.USER")}
            </span>
            <AccountStateBadge state={user.state} />
          </div>
        </div>
      </header>

      {user.state === "deleted" ? (
        <motion.div {...fadeUp(0)}>
          <div className="rounded-md border border-danger/40 bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger">{t("admin.deletedBanner")}</div>
          <section className="mt-3 rounded-card border border-border bg-surface-2 p-5">
            <h2 className="font-display text-[15px] leading-[22px] font-semibold text-text-2">{t("admin.facts")}</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {[
                [t("admin.col.username"), user.username],
                [t("admin.col.email"), user.email ?? "—"],
                [t("admin.col.role"), t(user.role === "ADMIN" ? "role.ADMIN" : "role.USER")],
                [t("admin.col.state"), t("status.deleted")],
                [t("admin.col.store"), user.storefront.enabled ? t("admin.store.configured") : t("admin.store.notConfigured")],
                [t("admin.storefront.slug"), user.storefront.slug ?? "—"],
                [t("admin.createdAt"), formatDateTime(user.createdAt)],
                [t("admin.col.lastActivity"), formatDateTime(user.lastActivityAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-border py-1.5">
                  <dt className="text-text-3">{k}</dt>
                  <dd className="text-text-2">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </motion.div>
      ) : (
        <AccountEditor user={user} onChanged={refresh} />
      )}
    </div>
  );
}

function AccountEditor({ user, onChanged }: { user: User; onChanged: () => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState("identity");
  const tabs = [
    { id: "identity", label: t("admin.tab.identity") },
    { id: "access", label: t("admin.tab.access") },
    { id: "storefront", label: t("admin.tab.storefront") },
    { id: "preferences", label: t("admin.tab.preferences") },
    { id: "danger", label: t("admin.tab.danger") },
  ];
  return (
    <div>
      <SimpleTabs tabs={tabs} active={tab} onChange={setTab} />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="mt-4">
          {tab === "identity" && <IdentityTab user={user} onChanged={onChanged} />}
          {tab === "access" && <AccessTab user={user} onChanged={onChanged} />}
          {tab === "storefront" && <StorefrontTab user={user} onChanged={onChanged} />}
          {tab === "preferences" && <PreferencesTab user={user} onChanged={onChanged} />}
          {tab === "danger" && <DangerTab user={user} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function SaveBar({ dirty, saving, onSave }: { dirty: boolean; saving: boolean; onSave: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mt-4 flex justify-end">
      <Button onClick={onSave} disabled={!dirty || saving}>
        {saving ? t("common.loading") : t("common.save")}
      </Button>
    </div>
  );
}

function IdentityTab({ user, onChanged }: { user: User; onChanged: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = username !== user.username || email !== (user.email ?? "");

  const save = async () => {
    setError(null);
    setSaving(true);
    await mockLatency(600);
    if (users.some((u) => u.id !== user.id && u.username.toLowerCase() === username.trim().toLowerCase())) {
      setSaving(false);
      setError(t("admin.identity.valueInUse"));
      return;
    }
    user.username = username.trim();
    user.email = email.trim() || null;
    setSaving(false);
    toast("success", t("admin.saved"));
    onChanged();
  };

  return (
    <section className={cardCls}>
      {error && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
          <Button variant="secondary" size="sm" onClick={onChanged}>
            {t("admin.reload")}
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label={t("admin.acct.username")} htmlFor="id-username">
          <input id="id-username" className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} />
        </AdminField>
        <AdminField label={t("admin.acct.email")} hint={t("admin.acct.emailCaption")} htmlFor="id-email">
          <input id="id-email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
        </AdminField>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} />
    </section>
  );
}

function AccessTab({ user, onChanged }: { user: User; onChanged: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [role, setRole] = useState<Role>(user.role);
  const [stateConfirm, setStateConfirm] = useState(false);
  const [lastAdminOpen, setLastAdminOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [totpConfirm, setTotpConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeAdmins = users.filter((u) => u.role === "ADMIN" && u.state === "active");
  const isLastAdmin = user.role === "ADMIN" && user.state === "active" && activeAdmins.length === 1 && activeAdmins[0]!.id === user.id;

  const saveRole = async () => {
    if (isLastAdmin && role === "USER") {
      setLastAdminOpen(true);
      return;
    }
    setSaving(true);
    await mockLatency(600);
    user.role = role;
    setSaving(false);
    toast("success", t("admin.saved"));
    onChanged();
  };

  const toggleState = async () => {
    if (isLastAdmin && user.state === "active") {
      setStateConfirm(false);
      setLastAdminOpen(true);
      return;
    }
    await mockLatency(600);
    user.state = user.state === "active" ? "disabled" : "active";
    toast("success", t("admin.access.stateChanged"));
    onChanged();
  };

  const doReset = async () => {
    await mockLatency(700);
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
    setTempPassword(s);
    toast("success", t("admin.access.resetSuccess"));
  };

  const disableTotp = async () => {
    await mockLatency(600);
    user.totpEnabled = false;
    setTotpConfirm(false);
    toast("success", t("admin.access.totpDisabled"));
    onChanged();
  };

  return (
    <section className={`${cardCls} space-y-6`}>
      <div>
        <AdminField label={t("admin.access.roleLabel")}>
          <SegmentedControl<Role>
            layoutId="access-role"
            value={role}
            onChange={setRole}
            options={[
              { value: "USER", label: t("role.USER") },
              { value: "ADMIN", label: t("role.ADMIN") },
            ]}
          />
        </AdminField>
        <SaveBar dirty={role !== user.role} saving={saving} onSave={() => void saveRole()} />
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <div>
          <p className="text-sm font-medium text-text">{t("admin.access.stateLabel")}</p>
          <p className="text-xs text-text-3">{user.state === "active" ? t("status.active") : t("status.disabled")}</p>
        </div>
        <Button variant="secondary" onClick={() => setStateConfirm(true)}>
          {user.state === "active" ? t("admin.deactivate") : t("admin.activate")}
        </Button>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <p className="text-sm font-medium text-text">{t("admin.access.resetPassword")}</p>
        <Button variant="secondary" onClick={() => setResetOpen(true)}>
          {t("admin.access.resetPassword")}
        </Button>
      </div>

      {user.totpEnabled && (
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text">{t("admin.access.disableTotp")}</p>
            <Button variant="secondary" onClick={() => setTotpConfirm(true)}>
              {t("admin.access.disableTotp")}
            </Button>
          </div>
          <p className="mt-1 text-xs text-text-3">{t("admin.access.totpNote")}</p>
        </div>
      )}

      <ConfirmDialog
        open={stateConfirm}
        onClose={() => setStateConfirm(false)}
        onConfirm={() => void toggleState()}
        title={user.state === "active" ? t("admin.deactivate") : t("admin.activate")}
        body={user.username}
        destructive={user.state === "active"}
      />

      <Modal
        open={lastAdminOpen}
        onClose={() => setLastAdminOpen(false)}
        title={t("admin.access.lastAdminTitle")}
        footer={
          <Button variant="secondary" onClick={() => setLastAdminOpen(false)}>
            {t("common.close")}
          </Button>
        }
      >
        <div className="flex items-start gap-3 text-sm text-text-2">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          {t("admin.access.lastAdminBody")}
        </div>
      </Modal>

      <Modal
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setTempPassword(null);
        }}
        title={t("admin.access.resetPassword")}
        footer={
          tempPassword ? (
            <Button
              onClick={() => {
                setResetOpen(false);
                setTempPassword(null);
              }}
            >
              {t("common.close")}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setResetOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => void doReset()}>{t("common.confirm")}</Button>
            </>
          )
        }
      >
        {tempPassword ? (
          <div className="space-y-3">
            <CopyField value={tempPassword} truncate={false} />
            <p className="text-xs text-text-3">{t("admin.access.tempPasswordCaption")}</p>
          </div>
        ) : (
          <p className="text-sm text-text-2">{user.username}</p>
        )}
      </Modal>

      <ConfirmDialog
        open={totpConfirm}
        onClose={() => setTotpConfirm(false)}
        onConfirm={() => void disableTotp()}
        title={t("admin.access.disableTotp")}
        body={`${t("admin.access.totpNote")} — ${user.username}`}
      />
    </section>
  );
}

function StorefrontTab({ user, onChanged }: { user: User; onChanged: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const sf = user.storefront;
  const [slug, setSlug] = useState(sf.slug ?? "");
  const [names, setNames] = useState<LocalizedText>({ ...sf.displayName });
  const [accent, setAccent] = useState("#00B8A0");
  const [enabled, setEnabled] = useState(sf.enabled);
  const [theme, setTheme] = useState<ThemeId>(sf.theme);
  const [layout, setLayout] = useState(sf.layout);
  const [standalone, setStandalone] = useState(sf.standalonePayments);
  const [currency, setCurrency] = useState(sf.defaultCurrency);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeCurrencies = adminPlatformConfig.exchangeCurrencies.filter((c) => c.status === "active");

  const save = async () => {
    setSlugError(null);
    if (slug && !/^[a-z0-9-]+$/.test(slug)) {
      setSlugError(t("admin.storefront.slugInvalid"));
      return;
    }
    if (slug && users.some((u) => u.id !== user.id && u.storefront.slug === slug)) {
      setSlugError(t("admin.storefront.slugTaken"));
      return;
    }
    setSaving(true);
    await mockLatency(700);
    user.storefront = { ...sf, slug: slug || null, displayName: names, enabled, theme, layout, standalonePayments: standalone, defaultCurrency: currency };
    setSaving(false);
    toast("success", t("admin.saved"));
    onChanged();
  };

  return (
    <section className={`${cardCls} space-y-5`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label={t("admin.storefront.slug")} error={slugError} htmlFor="sf-slug">
          <input id="sf-slug" className={`${inputCls} font-money`} value={slug} onChange={(e) => setSlug(e.target.value)} />
        </AdminField>
        <AdminField label={t("admin.storefront.accent")} htmlFor="sf-accent">
          <div className="flex items-center gap-2">
            <span className="size-10 rounded-md border border-border" style={{ backgroundColor: accent }} aria-hidden />
            <input id="sf-accent" className={`${inputCls} font-money`} value={accent} onChange={(e) => setAccent(e.target.value)} />
          </div>
        </AdminField>
      </div>

      <LocalizedFieldGroup id="sf-names" label={t("admin.storefront.displayNames")} value={names} onChange={setNames} />

      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label={t("admin.storefront.layout")}>
          <SegmentedControl
            layoutId="sf-layout"
            value={layout}
            onChange={setLayout}
            options={[
              { value: "table", label: t("admin.storefront.layout.compact") },
              { value: "boxed", label: t("admin.storefront.layout.comfortable") },
            ]}
          />
        </AdminField>
        <AdminField label={t("admin.storefront.defaultCurrency")}>
          {activeCurrencies.length === 0 ? (
            <p className="text-sm text-text-3">{t("admin.storefront.noActiveCurrency")}</p>
          ) : (
            <select aria-label={t("admin.storefront.defaultCurrency")} className={inputCls} value={currency ?? ""} onChange={(e) => setCurrency((e.target.value || null) as typeof currency)}>
              <option value="">—</option>
              {activeCurrencies.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          )}
        </AdminField>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          {t("admin.storefront.enabled")}
        </label>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={standalone} onChange={(e) => setStandalone(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          {t("admin.storefront.standalone")}
        </label>
      </div>

      <div>
        <p className="text-[13px] font-medium text-text">{t("admin.storefront.theme")}</p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {THEMES.map((th) => {
            const selected = theme === th;
            return (
              <button
                key={th}
                type="button"
                aria-pressed={selected}
                onClick={() => setTheme(th)}
                className={`rounded-card border p-1.5 text-left transition-shadow ${selected ? "border-accent shadow-[0_0_0_3px_var(--ring-color)]" : "border-border hover:border-text-3"}`}
              >
                <img src={`/theme-swatch-${th}.svg`} alt="" width={96} height={64} className="w-full rounded-md" />
                <span className="mt-1 block text-xs font-medium text-text-2">{t(`theme.${th}`)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <SaveBar dirty saving={saving} onSave={() => void save()} />
    </section>
  );
}

function PreferencesTab({ user, onChanged }: { user: User; onChanged: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [lang, setLang] = useState<Locale>(user.locale);
  const [policy, setPolicy] = useState<Policy>("nameEmail");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await mockLatency(500);
    user.locale = lang;
    setSaving(false);
    toast("success", t("admin.saved"));
    onChanged();
  };

  const policies: Policy[] = ["none", "nameEmail", "nameEmailCpf", "fullAddress"];
  return (
    <section className={`${cardCls} space-y-5`}>
      <AdminField label={t("admin.prefs.language")}>
        <SegmentedControl<Locale>
          layoutId="pref-lang"
          value={lang}
          onChange={setLang}
          options={[
            { value: "pt-BR", label: "PT-BR" },
            { value: "en", label: "EN" },
          ]}
        />
      </AdminField>

      <div>
        <p className="text-[13px] font-medium text-text">{t("admin.prefs.checkoutPolicy")}</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {policies.map((p) => {
            const selected = policy === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={selected}
                onClick={() => setPolicy(p)}
                className={`rounded-card border p-4 text-left transition-shadow ${selected ? "border-accent shadow-[0_0_0_3px_var(--ring-color)]" : "border-border hover:border-text-3"}`}
              >
                <span className="block text-sm font-semibold text-text">{t(`admin.policy.${p}`)}</span>
                <span className="mt-1 block text-xs text-text-2">{t(`admin.policy.${p}Desc`)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <SaveBar dirty={lang !== user.locale} saving={saving} onSave={() => void save()} />
    </section>
  );
}

function DangerTab({ user }: { user: User }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    setDeleting(true);
    await mockLatency(800);
    user.state = "deleted";
    setDeleting(false);
    toast("success", t("admin.danger.deleted"));
    navigate("/admin/accounts");
  };

  return (
    <section className="rounded-card border border-danger/50 bg-surface p-5 shadow-card">
      <h2 className="font-display text-[15px] leading-[22px] font-semibold text-danger">{t("admin.danger.title")}</h2>
      <p className="mt-2 max-w-xl text-sm text-text-2">{t("admin.danger.body")}</p>
      <div className="mt-4">
        <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
          {t("admin.danger.delete")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void doDelete()}
        title={t("admin.danger.delete")}
        body={t("admin.danger.confirmBody", { username: user.username })}
        confirmLabel={t("admin.danger.delete")}
        requireText={user.username}
        loading={deleting}
      />
    </section>
  );
}
