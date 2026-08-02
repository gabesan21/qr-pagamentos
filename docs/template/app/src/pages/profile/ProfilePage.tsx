import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n";
import { useSession } from "@/mock/session";
import { mockLatency, users } from "@/mock/fixtures";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { CardSkeleton } from "@/components/ui/Skeletons";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { QRDisplay } from "@/components/ui/QRDisplay";
import { CopyField, useCopyToClipboard } from "@/components/ui/CopyField";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Checkbox } from "@/components/ui/checkbox";
import { Banner, Field, SectionCard, inputCls } from "../catalog/fields";

/* Mock TOTP rule: any 6-digit code ending in "0" verifies; others fail. */
const codeOk = (code: string) => /^\d{6}$/.test(code) && code.endsWith("0");

const randomSecret = () => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  return Array.from({ length: 16 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
};

const randomCode = () =>
  Array.from({ length: 4 }, () => Math.floor(Math.random() * 36).toString(36)).join("").toUpperCase() +
  "-" +
  Array.from({ length: 4 }, () => Math.floor(Math.random() * 36).toString(36)).join("").toUpperCase();

const makeCodes = () => Array.from({ length: 8 }, randomCode);

export default function ProfilePage() {
  const { t, formatDate } = useI18n();
  const { user } = useSession();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);

  // Identity
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [baseline, setBaseline] = useState({ username: "", email: "" });
  const [idError, setIdError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [idConflict, setIdConflict] = useState(false);
  const [saving, setSaving] = useState(false);

  // Password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [newPwError, setNewPwError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // TOTP
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [enrolledAt, setEnrolledAt] = useState<string | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [secret, setSecret] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [codesSaved, setCodesSaved] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableOtp, setDisableOtp] = useState("");
  const [disableError, setDisableError] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenCodesOpen, setRegenCodesOpen] = useState(false);
  const [closeWarn, setCloseWarn] = useState(false);
  const { copied, copy } = useCopyToClipboard();
  const shakeRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (user) {
        setUsername(user.username);
        setEmail(user.email ?? "");
        setBaseline({ username: user.username, email: user.email ?? "" });
        setTotpEnabled(user.totpEnabled);
        setEnrolledAt(user.totpEnabled ? user.createdAt : null);
      }
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [user?.id]);

  const idDirty = username !== baseline.username || email !== baseline.email;

  const saveIdentity = async () => {
    setIdError(null);
    setEmailError(null);
    setIdConflict(false);
    if (!username.trim()) {
      setIdError(t("profile.identity.usernameRequired"));
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError(t("profile.identity.emailInvalid"));
      return;
    }
    if (users.some((u) => u.id !== user?.id && u.username.toLowerCase() === username.trim().toLowerCase())) {
      setIdError(t("profile.identity.usernameTaken"));
      return;
    }
    setSaving(true);
    await mockLatency(500);
    // Simulated concurrent-change conflict: ~20% of saves.
    if (Math.random() < 0.2) {
      setIdConflict(true);
      setSaving(false);
      return;
    }
    const fx = users.find((u) => u.id === user?.id);
    if (fx) {
      fx.username = username.trim();
      fx.email = email.trim() || null;
    }
    setBaseline({ username: username.trim(), email: email.trim() });
    setSaving(false);
    toast("success", t("profile.identity.saved"));
  };

  const reloadIdentity = () => {
    if (!user) return;
    setUsername(user.username);
    setEmail(user.email ?? "");
    setBaseline({ username: user.username, email: user.email ?? "" });
    setIdConflict(false);
  };

  const changePassword = async () => {
    setPwError(null);
    setNewPwError(null);
    setConfirmError(null);
    if (!currentPw) {
      setPwError(t("catalog.err.required"));
      return;
    }
    if (newPw.length < 12) {
      setNewPwError(t("reset.tooShort"));
      return;
    }
    if (newPw.length > 128) {
      setNewPwError(t("reset.tooLong"));
      return;
    }
    if (newPw !== confirmPw) {
      setConfirmError(t("reset.mismatch"));
      return;
    }
    setSaving(true);
    await mockLatency(600);
    if (currentPw !== "demo1234") {
      setPwError(t("profile.password.wrongCurrent"));
      setSaving(false);
      return;
    }
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setSaving(false);
    toast("success", t("profile.password.success"));
  };

  // --- TOTP flows ---
  const startEnroll = () => {
    setSecret(randomSecret());
    setCodes(makeCodes());
    setOtp("");
    setOtpError(false);
    setCodesSaved(false);
    setStep(1);
    setEnrollOpen(true);
  };

  const confirmEnrollmentCode = async () => {
    setVerifying(true);
    setOtpError(false);
    await mockLatency(500);
    if (!codeOk(otp)) {
      shakeRef.current += 1;
      setOtpError(true);
      setVerifying(false);
      return;
    }
    setVerifying(false);
    setStep(3);
  };

  const finishEnroll = () => {
    const fx = users.find((u) => u.id === user?.id);
    if (fx) fx.totpEnabled = true;
    setTotpEnabled(true);
    setEnrolledAt(new Date().toISOString());
    setEnrollOpen(false);
    // codes are never retained/displayed again
    setCodes([]);
    setSecret("");
    toast("success", t("profile.totp.enabledToast"));
  };

  const guardedEnrollClose = () => {
    if (step === 3 && !codesSaved) {
      setCloseWarn(true);
      return;
    }
    setEnrollOpen(false);
  };

  const disableTotp = async () => {
    setVerifying(true);
    setDisableError(false);
    await mockLatency(500);
    if (!codeOk(disableOtp)) {
      shakeRef.current += 1;
      setDisableError(true);
      setVerifying(false);
      return;
    }
    const fx = users.find((u) => u.id === user?.id);
    if (fx) fx.totpEnabled = false;
    setTotpEnabled(false);
    setEnrolledAt(null);
    setDisableOpen(false);
    setDisableOtp("");
    setVerifying(false);
    toast("success", t("profile.totp.disabled"));
  };

  const regenerateCodes = async () => {
    setVerifying(true);
    await mockLatency(600);
    setCodes(makeCodes());
    setCodesSaved(false);
    setRegenOpen(false);
    setRegenCodesOpen(true);
    setVerifying(false);
  };

  const finishRegen = () => {
    setRegenCodesOpen(false);
    setCodes([]);
    toast("success", t("profile.totp.codesSavedToast"));
  };

  const downloadCodes = () => {
    const blob = new Blob([codes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const provisioningUri = `otpauth://totp/QR%20Pagamentos:${encodeURIComponent(user?.username ?? "")}?secret=${secret}&issuer=QR%20Pagamentos`;

  const otpCells = (value: string, onChange: (v: string) => void) => (
    <InputOTP maxLength={6} value={value} onChange={onChange}>
      <InputOTPGroup className="font-money">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <InputOTPSlot key={i} index={i} className="bg-surface" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );

  const recoveryCodesGrid = (
    <div className="grid grid-cols-2 gap-2">
      {codes.map((c) => (
        <code key={c} className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-center font-money text-xs text-text">
          {c}
        </code>
      ))}
    </div>
  );

  const codesActions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => void copy(codes.join("\n"))}>
        {copied ? t("common.copied") : t("profile.totp.copyAll")}
      </Button>
      <Button variant="secondary" size="sm" onClick={downloadCodes}>
        {t("profile.totp.download")}
      </Button>
    </div>
  );

  const savedCheck = (
    <label className="flex items-center gap-2.5 text-sm text-text">
      <Checkbox checked={codesSaved} onCheckedChange={(v) => setCodesSaved(v === true)} />
      {t("profile.totp.savedCodes")}
    </label>
  );

  if (loading)
    return (
      <div className="space-y-4">
        <div className="skeleton-shimmer h-8 w-64 rounded-md" />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="font-display text-2xl leading-8 font-semibold text-text">{t("profile.title")}</h1>

      {/* Section 1 — Identity */}
      <SectionCard title={t("profile.identity.title")}>
        {idConflict && (
          <Banner tone="danger" className="mb-4">
            <p className="font-medium">{t("profile.identity.conflict")}</p>
            <p className="mt-0.5">{t("profile.identity.conflictBody")}</p>
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" size="sm" onClick={reloadIdentity}>
                {t("catalog.detail.reload")}
              </Button>
              <Button variant="ghost" size="sm" onClick={saveIdentity}>
                {t("common.retry")}
              </Button>
            </div>
          </Banner>
        )}
        <div className="space-y-5">
          <Field label={t("profile.identity.username")} htmlFor="pf-username" error={idError}>
            <input id="pf-username" className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label={t("profile.identity.email")} htmlFor="pf-email" error={emailError} helper={t("profile.identity.emailCaption")} optional>
            <input id="pf-email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button onClick={saveIdentity} disabled={!idDirty || saving}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* Section 2 — Password */}
      <SectionCard title={t("profile.password.title")}>
        <div className="space-y-5">
          <Field label={t("profile.password.current")} htmlFor="pf-pw-current" error={pwError}>
            <div className="relative">
              <input
                id="pf-pw-current"
                type={showCurrent ? "text" : "password"}
                className={`${inputCls} pr-10`}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                aria-label={showCurrent ? t("auth.hidePassword") : t("auth.showPassword")}
                onClick={() => setShowCurrent((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-3 hover:text-text"
              >
                {showCurrent ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
          </Field>
          <Field label={t("profile.password.new")} htmlFor="pf-pw-new" error={newPwError} helper={t("reset.requirement")}>
            <input
              id="pf-pw-new"
              type="password"
              className={inputCls}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
            />
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-2">
                <div
                  className={newPw.length >= 12 ? "h-full bg-success transition-all" : "h-full bg-warning transition-all"}
                  style={{ width: `${Math.min(100, (newPw.length / 12) * 100)}%` }}
                />
              </div>
              <span className={newPw.length >= 12 ? "text-xs text-success" : "text-xs text-text-3"}>
                {t("profile.password.lengthMeter", { len: newPw.length })}
              </span>
            </div>
          </Field>
          <Field label={t("profile.password.confirm")} htmlFor="pf-pw-confirm" error={confirmError}>
            <input
              id="pf-pw-confirm"
              type="password"
              className={inputCls}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <div className="flex justify-end">
            <Button onClick={changePassword} disabled={saving}>
              {saving ? t("common.loading") : t("profile.password.submit")}
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* Section 3 — TOTP */}
      <SectionCard title={t("profile.totp.title")}>
        {!totpEnabled ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 text-text-3" aria-hidden />
              <p className="text-sm text-text-2">{t("profile.totp.descOff")}</p>
            </div>
            <Button onClick={startEnroll}>{t("profile.totp.enable")}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-pill bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">{t("profile.totp.enabled")}</span>
              {enrolledAt && <span className="text-xs text-text-3">{t("profile.totp.enrolledSince", { date: formatDate(enrolledAt) })}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setRegenOpen(true)}>
                {t("profile.totp.regenerate")}
              </Button>
              <Button variant="ghost" className="text-danger" onClick={() => { setDisableOtp(""); setDisableError(false); setDisableOpen(true); }}>
                {t("profile.totp.disable")}
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Enrollment modal */}
      <Modal
        open={enrollOpen}
        onClose={guardedEnrollClose}
        title={step === 1 ? t("profile.totp.step1Title") : step === 2 ? t("profile.totp.step2Title") : t("profile.totp.step3Title")}
        width={520}
        footer={
          <>
            {step === 1 && (
              <Button onClick={() => setStep(2)}>{t("profile.totp.continue")}</Button>
            )}
            {step === 2 && (
              <>
                <Button variant="ghost" onClick={() => setStep(1)}>
                  {t("common.back")}
                </Button>
                <Button onClick={confirmEnrollmentCode} disabled={verifying || otp.length !== 6}>
                  {verifying ? t("common.loading") : t("profile.totp.confirm")}
                </Button>
              </>
            )}
            {step === 3 && (
              <Button onClick={finishEnroll} disabled={!codesSaved}>
                {t("profile.totp.done")}
              </Button>
            )}
          </>
        }
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            {step === 1 && (
              <>
                <p className="text-sm text-text-2">{t("profile.totp.step1Body")}</p>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                  <QRDisplay payload={provisioningUri} merchantName={user?.username ?? "QRP"} size={220} showPayload={false} />
                </motion.div>
                <div>
                  <p className="text-[13px] font-medium text-text">{t("profile.totp.manualSecret")}</p>
                  <div className="mt-1.5">
                    <CopyField value={secret} truncate={false} className="w-full" />
                  </div>
                  <p className="mt-1.5 text-xs text-warning">{t("profile.totp.secretOnce")}</p>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <p className="text-sm text-text-2">{t("profile.totp.step2Body")}</p>
                <motion.div key={`shake-${shakeRef.current}`} animate={otpError ? { x: [0, -8, 8, -6, 6, 0] } : undefined} transition={{ duration: 0.3 }}>
                  {otpCells(otp, (v) => { setOtp(v); setOtpError(false); })}
                </motion.div>
                {otpError && (
                  <p role="alert" className="text-xs font-medium text-danger">
                    {t("profile.totp.wrongCode")}
                  </p>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <p className="text-sm text-text-2">{t("profile.totp.step3Body")}</p>
                {recoveryCodesGrid}
                {codesActions}
                {savedCheck}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </Modal>

      {/* Disable 2FA */}
      <Modal
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title={t("profile.totp.disableTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDisableOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={disableTotp} disabled={verifying || disableOtp.length !== 6}>
              {verifying ? t("common.loading") : t("profile.totp.disable")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-2">{t("profile.totp.disableBody")}</p>
          <Field label={t("profile.totp.codeLabel")}>
            <motion.div key={`dshake-${shakeRef.current}`} animate={disableError ? { x: [0, -8, 8, -6, 6, 0] } : undefined} transition={{ duration: 0.3 }}>
              {otpCells(disableOtp, (v) => { setDisableOtp(v); setDisableError(false); })}
            </motion.div>
          </Field>
          {disableError && (
            <p role="alert" className="text-xs font-medium text-danger">
              {t("profile.totp.wrongCode")}
            </p>
          )}
        </div>
      </Modal>

      {/* Regenerate confirm */}
      <ConfirmDialog
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        onConfirm={regenerateCodes}
        title={t("profile.totp.regenerateTitle")}
        body={t("profile.totp.regenerateBody")}
        confirmLabel={t("profile.totp.regenerate")}
        loading={verifying}
      />

      {/* Regenerated codes (shown once) */}
      <Modal
        open={regenCodesOpen}
        onClose={() => (codesSaved ? finishRegen() : setCloseWarn(true))}
        title={t("profile.totp.step3Title")}
        footer={
          <Button onClick={finishRegen} disabled={!codesSaved}>
            {t("profile.totp.done")}
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-2">{t("profile.totp.step3Body")}</p>
          {recoveryCodesGrid}
          {codesActions}
          {savedCheck}
        </div>
      </Modal>

      {/* Warn-on-close guard */}
      <ConfirmDialog
        open={closeWarn}
        onClose={() => setCloseWarn(false)}
        onConfirm={() => {
          setCloseWarn(false);
          setEnrollOpen(false);
          setRegenCodesOpen(false);
          setCodes([]);
        }}
        title={t("common.close")}
        body={t("profile.totp.closeWarning")}
        confirmLabel={t("common.close")}
      />
    </div>
  );
}
