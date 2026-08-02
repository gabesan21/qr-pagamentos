import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Clock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useSession } from "@/mock/session";
import type { ResetTokenState } from "@/mock/session";
import { Button } from "@/components/ui/button";
import { AuthShell } from "./AuthShell";

const inputCls = (invalid: boolean) =>
  cn(
    "h-10 w-full rounded-md border bg-surface px-3 pr-10 text-sm text-text placeholder:text-text-3",
    "focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)]",
    invalid ? "border-danger" : "border-border",
  );

export default function ResetPassword() {
  const { t } = useI18n();
  const { resolveResetToken, resetPassword } = useSession();
  const [params] = useSearchParams();
  const [tokenState, setTokenState] = useState<ResetTokenState>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [requestError, setRequestError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let alive = true;
    void resolveResetToken(params.get("token")).then((s) => {
      if (alive) setTokenState(s);
    });
    return () => {
      alive = false;
    };
  }, [params, resolveResetToken]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setRequestError(false);
    const errs: typeof errors = {};
    if (password.length < 12) errs.password = t("reset.tooShort");
    else if (password.length > 128) errs.password = t("reset.tooLong");
    if (confirm !== password) errs.confirm = t("reset.mismatch");
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);
    const result = await resetPassword(password);
    setLoading(false);
    if (result.ok) setSuccess(true);
    else setRequestError(true);
  };

  const meterPct = Math.min(100, (password.length / 12) * 100);

  return (
    <AuthShell>
      <AnimatePresence mode="wait">
        <motion.div
          key={success ? "success" : tokenState}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {tokenState === "loading" && !success && (
            <div role="status" aria-busy>
              <div className="skeleton-shimmer h-8 w-48 rounded-md" />
              <div className="skeleton-shimmer mt-6 h-10 w-full rounded-md" />
              <div className="skeleton-shimmer mt-4 h-10 w-full rounded-md" />
              <div className="skeleton-shimmer mt-6 h-12 w-full rounded-md" />
            </div>
          )}

          {(tokenState === "invalid" || tokenState === "expired" || tokenState === "used") && !success && (
            <div className="text-center">
              <img src="/unavailable.svg" alt="" width={160} height={160} className="mx-auto" />
              <StateIcon state={tokenState} />
              <h2 className="mt-3 font-display text-lg font-semibold text-text">
                {t(`reset.${tokenState}.title` as const)}
              </h2>
              <p className="mt-1 text-sm text-text-2">{t(`reset.${tokenState}.body` as const)}</p>
              <Link to="/login">
                <Button variant="secondary" className="mt-5">
                  {tokenState === "used" ? t("reset.goToLogin") : t("reset.backToLogin")}
                </Button>
              </Link>
            </div>
          )}

          {tokenState === "valid" && !success && (
            <div>
              <h1 className="font-display text-2xl leading-8 font-semibold text-text">{t("reset.title")}</h1>

              {requestError && (
                <div role="alert" className="mt-4 flex items-start gap-2 rounded-md bg-danger-soft p-3 text-sm text-danger">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {t("common.requestError")}
                </div>
              )}

              <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4" noValidate>
                <div>
                  <label htmlFor="new-password" className="text-[13px] font-medium text-text">
                    {t("reset.newPassword")}
                  </label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={show ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => {
                        if (password && password.length < 12) setErrors((er) => ({ ...er, password: t("reset.tooShort") }));
                      }}
                      className={inputCls(!!errors.password)}
                      aria-invalid={!!errors.password}
                    />
                    <button
                      type="button"
                      onClick={() => setShow((v) => !v)}
                      aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-3 hover:text-text"
                    >
                      {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                    </button>
                  </div>
                  {/* Live requirement meter */}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <motion.div
                      className={cn("h-full rounded-full", password.length >= 12 ? "bg-success" : "bg-accent")}
                      animate={{ width: `${meterPct}%` }}
                      transition={{ duration: 0.15 }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-text-3">{t("reset.requirement")}</p>
                  {errors.password && <p className="mt-1 text-xs text-danger">{errors.password}</p>}
                </div>

                <div>
                  <label htmlFor="confirm-password" className="text-[13px] font-medium text-text">
                    {t("reset.confirmPassword")}
                  </label>
                  <input
                    id="confirm-password"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onBlur={() => {
                      if (confirm && confirm !== password) setErrors((er) => ({ ...er, confirm: t("reset.mismatch") }));
                    }}
                    className={inputCls(!!errors.confirm)}
                    aria-invalid={!!errors.confirm}
                  />
                  {errors.confirm && <p className="mt-1 text-xs text-danger">{errors.confirm}</p>}
                </div>

                <Button type="submit" size="lg" className="h-12 w-full" disabled={loading}>
                  {loading ? t("common.loading") : t("reset.submit")}
                </Button>
              </form>
            </div>
          )}

          {success && (
            <div className="text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-success-soft">
                <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="var(--success)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <motion.path
                    d="M4 12.5l5 5L20 6.5"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.4 }}
                  />
                </svg>
              </div>
              <h2 className="mt-4 font-display text-lg font-semibold text-text">{t("reset.success.title")}</h2>
              <p className="mt-1 text-sm text-text-2">{t("reset.success.body")}</p>
              <Link to="/login">
                <Button className="mt-5">{t("auth.signIn")}</Button>
              </Link>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </AuthShell>
  );
}

function StateIcon({ state }: { state: "invalid" | "expired" | "used" }) {
  if (state === "expired") return <Clock className="mx-auto mt-4 size-6 text-text-3" aria-hidden />;
  if (state === "used") return <ShieldCheck className="mx-auto mt-4 size-6 text-text-3" aria-hidden />;
  return <AlertCircle className="mx-auto mt-4 size-6 text-text-3" aria-hidden />;
}
