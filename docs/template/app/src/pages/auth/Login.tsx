import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useSession } from "@/mock/session";
import { Button } from "@/components/ui/button";
import { AuthShell } from "./AuthShell";

const inputCls = (invalid: boolean) =>
  cn(
    "h-10 w-full rounded-md border bg-surface px-3 text-sm text-text placeholder:text-text-3",
    "focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)]",
    invalid ? "border-danger" : "border-border",
  );

export default function Login() {
  const { t } = useI18n();
  const { signIn, pendingTotpUser, demoUsers } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const usernameRef = useRef<HTMLInputElement>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs: typeof fieldErrors = {};
    if (!username.trim()) errs.username = t("auth.required");
    if (!password) errs.password = t("auth.required");
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);
    const result = await signIn(username, password);
    setLoading(false);
    if (result.ok && !result.requiresTotp) {
      const role = demoUsers.find((u) => u.username.toLowerCase() === username.trim().toLowerCase())?.role;
      navigate(role === "ADMIN" ? "/admin" : "/", { replace: true });
      return;
    }
    if (!result.ok) {
      // Generic error — never reveals which credential failed
      setError(t("auth.invalidCredentials"));
      setPassword("");
      usernameRef.current?.focus();
    }
  };

  return (
    <AuthShell>
      <AnimatePresence mode="wait">
        {pendingTotpUser ? (
          <TotpChallenge key="totp" username={pendingTotpUser.username} />
        ) : (
          <motion.div
            key="credentials"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.18 }}
          >
            <h1 className="font-display text-2xl leading-8 font-semibold text-text">{t("auth.signIn")}</h1>
            <p className="mt-1 text-sm text-text-2">{t("auth.signInCaption")}</p>

            {error && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-md bg-danger-soft p-3 text-sm text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </div>
            )}

            <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4" noValidate>
              <div>
                <label htmlFor="login-username" className="text-[13px] font-medium text-text">
                  {t("auth.username")}
                </label>
                <input
                  id="login-username"
                  ref={usernameRef}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputCls(!!fieldErrors.username || !!error)}
                  aria-invalid={!!fieldErrors.username || !!error}
                />
                {fieldErrors.username && <p className="mt-1 text-xs text-danger">{fieldErrors.username}</p>}
              </div>
              <div>
                <label htmlFor="login-password" className="text-[13px] font-medium text-text">
                  {t("auth.password")}
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(inputCls(!!fieldErrors.password || !!error), "pr-10")}
                    aria-invalid={!!fieldErrors.password || !!error}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-3 hover:text-text"
                  >
                    {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                  </button>
                </div>
                {fieldErrors.password && <p className="mt-1 text-xs text-danger">{fieldErrors.password}</p>}
              </div>
              <Button type="submit" size="lg" className="h-12 w-full" disabled={loading}>
                {loading ? t("common.loading") : t("auth.signIn")}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm">
              <Link to="/reset-password" className="text-text-2 underline-offset-2 hover:text-accent hover:underline">
                {t("auth.forgot")}
              </Link>
              <span className="mt-1 block text-xs text-text-3">{t("auth.forgotNote")}</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthShell>
  );
}

function TotpChallenge({ username }: { username: string }) {
  const { t } = useI18n();
  const { verifyTotp, cancelTotp } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [recovery, setRecovery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(0);
  const [done, setDone] = useState(false);
  const cellRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    cellRefs.current[0]?.focus();
  }, []);

  const submit = async (code: string) => {
    setError(null);
    setLoading(true);
    const result = await verifyTotp(code);
    setLoading(false);
    if (result.ok) {
      setDone(true);
      setTimeout(() => navigate("/", { replace: true }), 250);
      return;
    }
    if (result.error === "too-many-attempts") {
      setLocked(true);
      setError(t("auth.tooManyAttempts"));
    } else {
      setError(t("auth.wrongCode"));
      setShake((n) => n + 1);
      setDigits(Array(6).fill(""));
      setRecovery("");
      cellRefs.current[0]?.focus();
    }
  };

  const onDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    // Paste support: fill forward
    if (clean.length > 1) {
      const next = [...digits];
      for (let k = 0; k < clean.length && i + k < 6; k++) next[i + k] = clean[k]!;
      setDigits(next);
      const filled = next.every((d) => d);
      cellRefs.current[Math.min(i + clean.length, 5)]?.focus();
      if (filled) void submit(next.join(""));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) cellRefs.current[i + 1]?.focus();
    if (clean && next.every((d) => d)) void submit(next.join(""));
  };

  const onKeyDown = (i: number, key: string) => {
    if (key === "Backspace" && !digits[i] && i > 0) cellRefs.current[i - 1]?.focus();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.18 }}
    >
      <h2 className="font-display text-2xl leading-8 font-semibold text-text">{t("auth.totpTitle")}</h2>
      <p className="mt-1 text-sm text-text-2">{t("auth.totpCaption", { username })}</p>

      {locked && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm text-warning">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("auth.tooManyAttempts")}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(mode === "totp" ? digits.join("") : recovery);
        }}
        className="mt-6 space-y-4"
      >
        {mode === "totp" ? (
          <div>
            <span className="text-[13px] font-medium text-text">{t("auth.totpLabel")}</span>
            <motion.div
              key={shake}
              animate={shake ? { x: [0, -6, 6, -6, 6, 0] } : undefined}
              transition={{ duration: 0.3 }}
              className="mt-1.5 flex gap-2"
            >
              {digits.map((d, i) => (
                <motion.input
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  ref={(el) => {
                    cellRefs.current[i] = el;
                  }}
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={6}
                  value={d}
                  disabled={locked || loading}
                  onChange={(e) => onDigit(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e.key)}
                  aria-label={`${t("auth.totpLabel")} ${i + 1}`}
                  className={cn(
                    "h-12 w-11 rounded-md border bg-surface text-center font-money text-[22px] text-text",
                    "focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)] disabled:opacity-50",
                    error && !locked ? "border-danger" : "border-border",
                  )}
                />
              ))}
            </motion.div>
          </div>
        ) : (
          <div>
            <label htmlFor="recovery-code" className="text-[13px] font-medium text-text">
              {t("auth.recoveryLabel")}
            </label>
            <input
              id="recovery-code"
              value={recovery}
              disabled={locked || loading}
              onChange={(e) => {
                const clean = e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
                const grouped = clean.replace(/(.{4})(?=.)/, "$1-");
                setRecovery(grouped);
              }}
              placeholder="xxxx-xxxx"
              className={cn(
                "mt-1.5 h-12 w-full rounded-md border bg-surface px-3 font-money text-lg tracking-widest text-text",
                "focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)] disabled:opacity-50",
                error && !locked ? "border-danger" : "border-border",
              )}
            />
          </div>
        )}

        {error && !locked && <p className="text-xs text-danger">{error}</p>}

        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" onClick={cancelTotp} disabled={loading}>
            {t("common.back")}
          </Button>
          <Button type="submit" className="flex-1" disabled={locked || loading || done}>
            {done ? "✓" : loading ? t("common.loading") : t("auth.verify")}
          </Button>
        </div>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "totp" ? "recovery" : "totp"));
            setError(null);
          }}
          className="w-full text-center text-sm text-text-2 underline-offset-2 hover:text-accent hover:underline"
        >
          {mode === "totp" ? t("auth.useRecovery") : t("auth.useTotp")}
        </button>
      </form>
    </motion.div>
  );
}
