import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ExternalLink, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/i18n";
import { useToast } from "@/components/ui/Toast";
import { DataTable } from "@/components/ui/DataTable";
import type { Column } from "@/components/ui/DataTable";
import { FilterBar } from "@/components/ui/FilterBar";
import type { FilterChip } from "@/components/ui/FilterBar";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/CopyField";
import { AccountStateBadge } from "@/components/ui/StatusBadge";
import type { AccountState, Role, User } from "@/mock/types";
import { mockLatency, users } from "@/mock/fixtures";
import { AdminField, DateRangeFilter, FilterSelect, SegmentedControl, inputCls, useMockQuery, useUrlFilters } from "./shared";

const roles: Role[] = ["ADMIN", "USER"];
const states: AccountState[] = ["active", "disabled", "deleted"];

function relTime(at: string, daysAgo: (n: number) => string, today: string) {
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
  return days <= 0 ? today : daysAgo(days);
}

export default function AdminAccounts() {
  const { t, formatDate } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [localUsers, setLocalUsers] = useState<User[]>(users);
  const { params, set, clearAll } = useUrlFilters({ role: roles, state: states }, () => toast("info", t("admin.invalidFiltersIgnored")));

  const q = (params.get("q") ?? "").toLowerCase();
  const fRole = params.get("role") ?? "";
  const fState = params.get("state") ?? "";
  const fFrom = params.get("from") ?? "";
  const fTo = params.get("to") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = [10, 25, 50].includes(Number(params.get("size"))) ? Number(params.get("size")) : 10;

  const { loading, error, retry } = useMockQuery(async () => {
    await mockLatency(500);
    return true;
  }, []);

  const filtered = useMemo(
    () =>
      localUsers.filter((u) => {
        if (fRole && u.role !== fRole) return false;
        if (fState && u.state !== fState) return false;
        if (fFrom && u.createdAt < new Date(fFrom).toISOString()) return false;
        if (fTo && u.createdAt > new Date(`${fTo}T23:59:59`).toISOString()) return false;
        if (q && ![u.username, u.email ?? ""].join(" ").toLowerCase().includes(q)) return false;
        return true;
      }),
    [localUsers, fRole, fState, fFrom, fTo, q],
  );

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const rows = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  const chips: FilterChip[] = [
    fRole && { key: "role", label: `${t("admin.filter.role")}: ${t(fRole === "ADMIN" ? "role.ADMIN" : "role.USER")}`, onRemove: () => set("role", null) },
    fState && { key: "state", label: t(`status.${fState}` as never), onRemove: () => set("state", null) },
    (fFrom || fTo) && { key: "date", label: `${fFrom || "…"} → ${fTo || "…"}`, onRemove: () => { set("from", null); set("to", null); } },
  ].filter(Boolean) as FilterChip[];

  const onCreated = (u: User) => {
    users.push(u);
    setLocalUsers([...users]);
    setHighlightId(u.id);
    toast("success", t("admin.acct.created"));
    setTimeout(() => setHighlightId(null), 1600);
  };

  const columns: Column<User>[] = [
    {
      key: "username",
      header: t("admin.col.username"),
      render: (u) => (
        <span className="flex items-center gap-2">
          <span className={`font-money ${u.state === "deleted" ? "line-through" : ""}`}>{u.username}</span>
          {u.id === highlightId && <motion.span layoutId="new-row" className="rounded-pill bg-accent-soft px-2 py-0.5 text-xs text-text" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.5 }} />}
          {u.state === "deleted" && <span className="rounded-pill bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger">{t("status.deleted")}</span>}
        </span>
      ),
    },
    { key: "email", header: t("admin.col.email"), render: (u) => <span className="text-xs text-text-2">{u.email ?? "—"}</span> },
    {
      key: "role",
      header: t("admin.col.role"),
      render: (u) => <span className={`rounded-pill px-2 py-0.5 text-xs font-medium ${u.role === "ADMIN" ? "bg-accent-soft text-text" : "bg-surface-2 text-text-2"}`}>{t(u.role === "ADMIN" ? "role.ADMIN" : "role.USER")}</span>,
    },
    { key: "state", header: t("admin.col.state"), render: (u) => <AccountStateBadge state={u.state} /> },
    {
      key: "store",
      header: t("admin.col.store"),
      render: (u) =>
        u.storefront.enabled && u.storefront.slug ? (
          <span className="rounded-pill bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
            {t("admin.store.configured")} · <span className="font-money">{u.storefront.slug}</span>
          </span>
        ) : (
          <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-2">{t("admin.store.notConfigured")}</span>
        ),
    },
    { key: "created", header: t("admin.col.created"), render: (u) => <span className="text-xs text-text-2">{formatDate(u.createdAt)}</span> },
    {
      key: "activity",
      header: t("admin.col.lastActivity"),
      render: (u) => (
        <span className="text-xs text-text-2">
          {formatDate(u.lastActivityAt)} <span className="text-text-3">({relTime(u.lastActivityAt, (n) => t("admin.daysAgo", { n }), t("admin.today"))})</span>
        </span>
      ),
    },
    {
      key: "actions",
      header: t("admin.col.actions"),
      render: (u) =>
        u.state === "deleted" ? (
          <span className="text-xs text-text-3">—</span>
        ) : (
          <button
            type="button"
            aria-label={t("common.open")}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/admin/accounts/${u.id}`);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl leading-8 font-semibold tracking-[-0.02em] text-text">{t("admin.usersTitle")}</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden />
          {t("admin.createAccount")}
        </Button>
      </div>

      <FilterBar searchPlaceholder={t("common.search")} chips={chips} onClearAll={clearAll}>
        <FilterSelect label={t("admin.filter.role")} value={fRole} onChange={(v) => set("role", v || null)} allLabel={t("admin.filter.role")} options={roles.map((r) => ({ value: r, label: t(r === "ADMIN" ? "role.ADMIN" : "role.USER") }))} />
        <FilterSelect label={t("admin.filter.state")} value={fState} onChange={(v) => set("state", v || null)} allLabel={t("admin.filter.state")} options={states.map((s) => ({ value: s, label: t(`status.${s}` as never) }))} />
        <DateRangeFilter from={fFrom} to={fTo} onFrom={(v) => set("from", v || null)} onTo={(v) => set("to", v || null)} />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(u) => u.id}
        loading={loading}
        error={error}
        onRetry={retry}
        emptyVariant={chips.length > 0 || q ? "filtered" : "empty"}
        emptyIllustration="users"
        emptyTitle={t("empty.users.title")}
        emptyBody={t("empty.users.body")}
        emptyAction={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            {t("admin.createAccount")}
          </Button>
        }
        onClearFilters={clearAll}
        onRowClick={(u) => u.state !== "deleted" && navigate(`/admin/accounts/${u.id}`)}
        page={clampedPage}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => set("page", String(p))}
        onPageSizeChange={(s) => set("size", String(s))}
      />

      <CreateAccountModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={onCreated} />
    </div>
  );
}

function passwordStrength(pw: string): 0 | 1 | 2 {
  if (pw.length >= 16 && /[A-Z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) return 2;
  if (pw.length >= 12) return 1;
  return 0;
}

function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%";
  let s = "";
  for (let i = 0; i < 18; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function CreateAccountModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (u: User) => void }) {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("USER");
  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; email?: string; password?: string; conflict?: string }>({});

  const reset = () => {
    setUsername("");
    setEmail("");
    setPassword("");
    setRole("USER");
    setStatus("active");
    setErrors({});
  };

  const strength = passwordStrength(password);

  const submit = async () => {
    const errs: typeof errors = {};
    if (!username.trim()) errs.username = t("auth.required");
    else if (users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase())) errs.username = t("admin.acct.usernameTaken");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = t("admin.acct.emailInvalid");
    if (password.length < 12) errs.password = t("reset.tooShort");
    else if (password.length > 128) errs.password = t("reset.tooLong");
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    await mockLatency(700);
    // Simulated race conflict check
    if (users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase())) {
      setSaving(false);
      setErrors({ conflict: t("admin.acct.conflictExists") });
      return;
    }
    const u: User = {
      id: `u_${Date.now().toString(36)}`,
      username: username.trim(),
      email: email.trim() || null,
      role,
      state: status,
      locale: "pt-BR",
      totpEnabled: false,
      storefront: {
        enabled: false,
        slug: null,
        displayName: { "pt-BR": username.trim(), en: username.trim() },
        theme: "pix-paper",
        layout: "boxed",
        accent: "#00B8A0",
        logoUrl: null,
        standalonePayments: false,
        defaultCurrency: "BRL",
        checkoutPolicy: "none",
      },
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };
    setSaving(false);
    reset();
    onClose();
    onCreated(u);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t("admin.createAccount")}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? t("common.loading") : t("common.create")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {errors.conflict && <div className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">{errors.conflict}</div>}
        <AdminField label={t("admin.acct.username")} error={errors.username} htmlFor="acct-username">
          <input id="acct-username" className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} />
        </AdminField>
        <AdminField label={t("admin.acct.email")} error={errors.email} hint={t("admin.acct.emailCaption")} htmlFor="acct-email">
          <input id="acct-email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
        </AdminField>
        <AdminField label={t("admin.acct.initialPassword")} error={errors.password} hint={t("reset.requirement")} htmlFor="acct-password">
          <div className="flex gap-2">
            <input id="acct-password" className={`${inputCls} font-money`} value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="button" variant="secondary" onClick={() => setPassword(generatePassword())}>
              {t("admin.acct.generate")}
            </Button>
          </div>
          {password && (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  className={`h-full rounded-full ${strength === 2 ? "bg-success" : strength === 1 ? "bg-warning" : "bg-danger"}`}
                  animate={{ width: `${strength === 2 ? 100 : strength === 1 ? 60 : 25}%` }}
                  transition={{ duration: 0.25 }}
                />
              </div>
              <p className="mt-1 text-xs text-text-3">{t(strength === 2 ? "admin.strength.strong" : strength === 1 ? "admin.strength.medium" : "admin.strength.weak")}</p>
              {password.length >= 12 && (
                <div className="mt-2">
                  <CopyField value={password} truncate={false} />
                </div>
              )}
            </div>
          )}
        </AdminField>
        <AdminField label={t("admin.acct.role")}>
          <SegmentedControl<Role>
            layoutId="acct-role"
            value={role}
            onChange={setRole}
            options={[
              { value: "USER", label: t("role.USER") },
              { value: "ADMIN", label: t("role.ADMIN") },
            ]}
          />
          <p className="mt-1.5 text-xs text-text-3">{t(role === "ADMIN" ? "admin.acct.roleAdminDesc" : "admin.acct.roleUserDesc")}</p>
        </AdminField>
        <AdminField label={t("admin.acct.initialStatus")}>
          <SegmentedControl
            layoutId="acct-status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "active", label: t("status.active") },
              { value: "disabled", label: t("status.disabled") },
            ]}
          />
        </AdminField>
      </div>
    </Modal>
  );
}
