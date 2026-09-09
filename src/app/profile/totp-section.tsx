"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { CopyField } from "@/components/ui/copy-field";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";

import { NoticeToast, type NoticeToastEntry } from "@/app/notice-toast";

import { RecoveryCodes } from "./recovery-codes";
import { TotpQrCode } from "./totp-qr-code";

type TotpStatus = "none" | "pending" | "active";
type TotpNotice = "totp-enrolled" | "totp-confirmed" | "totp-disabled" | "totp-failed" | "totp-conflict" | null;
type EnrollStep = "confirm" | "codes";
type CloseWarnTarget = "enroll" | "regenerate" | null;

type TotpDictionary = {
  profileTotpTitle: string;
  profileTotpDescription: string;
  profileTotpNoneDescription: string;
  profileTotpEnroll: string;
  profileTotpEnrolling: string;
  profileTotpConfirm: string;
  profileTotpConfirming: string;
  profileTotpWrongCode: string;
  profileTotpActiveDescription: string;
  profileTotpPendingDescription: string;
  profileTotpDisable: string;
  profileTotpDisableDescription: string;
  profileTotpRegenerate: string;
  profileTotpRegenerating: string;
  profileTotpRecoveryCodesTitle: string;
  profileTotpRecoveryCodesDescription: string;
  profileTotpCopied: string;
  profileTotpCopy: string;
  profileTotpDownload: string;
  profileTotpQrLabel: string;
  profileTotpQrCaption: string;
  profileTotpManualSecretLabel: string;
  profileCurrentPasswordLabel: string;
  profileTotpEnabledBadge: string;
  profileTotpConfirmStepTitle: string;
  profileTotpConfirmStepBody: string;
  profileTotpCodesStepTitle: string;
  profileTotpCodesStepBody: string;
  profileTotpContinue: string;
  profileTotpDone: string;
  profileTotpCloseWarning: string;
  profileTotpDisableTitle: string;
  profileTotpDisableBody: string;
  profileTotpRegenerateTitle: string;
  profileTotpRegenerateBody: string;
  profileTotpSavedCodes: string;
  profileTotpCodeLabel: string;
  cancel: string;
  close: string;
  loading: string;
  copyFieldCopied: string;
  copyFieldCopy: string;
  totpEnrolled: string;
  totpConfirmed: string;
  totpDisabled: string;
  totpFailed: string;
  totpConflict: string;
};

type EnrollmentData = { provisioningUri: string; recoveryCodes: string[] };

type TotpSectionProps = Readonly<{
  dictionary: TotpDictionary;
  status: TotpStatus;
  notice: TotpNotice;
}>;

function OtpInput({ id, name }: Readonly<{ id: string; name: string }>) {
  return (
    <InputOTP id={id} maxLength={6} name={name} pattern="[0-9]*" inputMode="numeric">
      <InputOTPGroup>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <InputOTPSlot index={index} key={index} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}

// The unchanged enroll response only returns the full `otpauth://` URI; the
// manual-secret CopyField needs just the `secret` query value out of it.
function parseSecret(provisioningUri: string): string {
  const match = /[?&]secret=([^&]+)/.exec(provisioningUri);
  return match ? decodeURIComponent(match[1]) : "";
}

export function TotpSection({ dictionary, status, notice }: TotpSectionProps) {
  const [enrollment, setEnrollment] = useState<EnrollmentData | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [enrollStep, setEnrollStep] = useState<EnrollStep>("confirm");
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [codesSaved, setCodesSaved] = useState(false);
  const [closeWarnTarget, setCloseWarnTarget] = useState<CloseWarnTarget>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [regeneratedCodes, setRegeneratedCodes] = useState<string[] | null>(null);
  const [enrollPending, setEnrollPending] = useState(false);

  const noticeCopy = notice === "totp-enrolled"
    ? dictionary.totpEnrolled
    : notice === "totp-confirmed"
      ? dictionary.totpConfirmed
      : notice === "totp-disabled"
        ? dictionary.totpDisabled
        : notice === "totp-failed"
          ? dictionary.totpFailed
          : notice === "totp-conflict"
            ? dictionary.totpConflict
            : null;
  const noticeFailed = notice === "totp-failed" || notice === "totp-conflict";
  // `notice` mirrors the `/profile?totp=<value>` query the page resolved;
  // recover the raw value by dropping the "totp-" prefix so the bridge
  // matches the exact param the server redirected with.
  const noticeEntries: NoticeToastEntry[] = notice
    ? [{ param: "totp", value: notice.slice("totp-".length), kind: noticeFailed ? "error" : "success", message: noticeCopy ?? "" }]
    : [];

  async function postJson(url: string): Promise<unknown> {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    });
    if (!response.ok) throw new Error("unavailable");
    return response.json();
  }

  async function handleEnroll() {
    setEnrollPending(true);
    try {
      const data = await postJson("/profile/totp/enroll");
      if (data && typeof data === "object" && "provisioningUri" in data && "recoveryCodes" in data) {
        setEnrollment(data as EnrollmentData);
        setCodesSaved(false);
        setConfirmError(false);
        setEnrollStep("confirm");
        setEnrollOpen(true);
      }
    } catch {
      window.location.href = "/profile?totp=failed";
    } finally {
      setEnrollPending(false);
    }
  }

  // Submitted with `fetch` so the enrolled secret's QR/manual key stay
  // visible on a wrong code instead of a full-page reload; `fetch` follows
  // the unchanged 303 by default, and the `totp` param on the followed
  // target is the same one the native `<noscript>` path would land on.
  async function handleConfirmSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setConfirmPending(true);
    setConfirmError(false);
    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        credentials: "same-origin",
      });
      let totpParam: string | null = null;
      try {
        totpParam = new URL(response.url).searchParams.get("totp");
      } catch {
        totpParam = null;
      }
      if (totpParam === "confirmed") {
        setConfirmed(true);
        setEnrollStep("codes");
      } else if (totpParam === "failed") {
        setConfirmError(true);
      } else {
        form.submit();
        return;
      }
    } catch {
      form.submit();
      return;
    } finally {
      setConfirmPending(false);
    }
  }

  async function handleRegenerate() {
    const data = await postJson("/profile/totp/regenerate");
    if (!data || typeof data !== "object" || !("recoveryCodes" in data)) {
      throw new Error("unavailable");
    }
    setRegeneratedCodes((data as { recoveryCodes: string[] }).recoveryCodes);
    setCodesSaved(false);
    setRegenerateOpen(true);
  }

  function handleEnrollOpenChange(open: boolean) {
    if (!open && enrollStep === "codes" && !codesSaved) {
      setCloseWarnTarget("enroll");
      return;
    }
    if (!open) setEnrollment(null);
    setEnrollOpen(open);
  }

  function handleRegenerateOpenChange(open: boolean) {
    if (!open && !codesSaved) {
      setCloseWarnTarget("regenerate");
      return;
    }
    if (!open) setRegeneratedCodes(null);
    setRegenerateOpen(open);
  }

  function confirmClose() {
    if (closeWarnTarget === "enroll") {
      setEnrollOpen(false);
      setEnrollment(null);
    } else if (closeWarnTarget === "regenerate") {
      setRegenerateOpen(false);
      setRegeneratedCodes(null);
    }
    setCloseWarnTarget(null);
  }

  const secret = enrollment ? parseSecret(enrollment.provisioningUri) : "";
  const resolvedStatus: TotpStatus = confirmed ? "active" : enrollment ? "pending" : status;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.profileTotpTitle}</CardTitle>
        <CardDescription>{dictionary.profileTotpDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <NoticeToast notices={noticeEntries} />
        {noticeCopy && (
          <noscript>
            <Alert className="mb-5" role={noticeFailed ? "alert" : "status"} variant={noticeFailed ? "destructive" : "success"}>
              <AlertTitle>{dictionary.profileTotpTitle}</AlertTitle>
              <AlertDescription>{noticeCopy}</AlertDescription>
            </Alert>
          </noscript>
        )}
        {resolvedStatus === "none" && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">{dictionary.profileTotpNoneDescription}</p>
            </div>
            <Button aria-busy={enrollPending || undefined} disabled={enrollPending} onClick={() => void handleEnroll()} type="button">
              {enrollPending && <Spinner data-icon="inline-start" />}
              {enrollPending ? dictionary.profileTotpEnrolling : dictionary.profileTotpEnroll}
            </Button>
          </div>
        )}
        {resolvedStatus === "pending" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge label={dictionary.profileTotpEnabledBadge} tone="warning" />
              <p className="text-sm text-muted-foreground">{dictionary.profileTotpPendingDescription}</p>
            </div>
            {enrollment ? (
              <Button onClick={() => setEnrollOpen(true)} type="button" variant="secondary">
                {dictionary.profileTotpContinue}
              </Button>
            ) : null}
          </div>
        )}
        {resolvedStatus === "active" && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge label={dictionary.profileTotpEnabledBadge} tone="success" />
              <p className="text-sm text-muted-foreground">{dictionary.profileTotpActiveDescription}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setRegenerateConfirmOpen(true)} type="button" variant="secondary">
                {dictionary.profileTotpRegenerate}
              </Button>
              <Button onClick={() => setDisableOpen(true)} type="button" variant="ghost" className="text-destructive hover:text-destructive">
                {dictionary.profileTotpDisable}
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <Modal
        closeLabel={dictionary.close}
        onOpenChange={handleEnrollOpenChange}
        open={enrollOpen}
        title={enrollStep === "confirm" ? dictionary.profileTotpConfirmStepTitle : dictionary.profileTotpCodesStepTitle}
      >
        {enrollment && enrollStep === "confirm" ? (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">{dictionary.profileTotpConfirmStepBody}</p>
            <TotpQrCode caption={dictionary.profileTotpQrCaption} label={dictionary.profileTotpQrLabel} provisioningUri={enrollment.provisioningUri} />
            <div>
              <p className="text-sm font-medium">{dictionary.profileTotpManualSecretLabel}</p>
              <CopyField
                className="mt-1.5 w-full"
                labels={{ copy: dictionary.copyFieldCopy, pending: dictionary.loading, copied: dictionary.copyFieldCopied, failed: dictionary.totpFailed }}
                truncate={false}
                value={secret}
              />
            </div>
            <form action="/profile/totp/confirm" className="space-y-4" method="post" noValidate onSubmit={(event) => void handleConfirmSubmit(event)}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="totp-confirm-password">{dictionary.profileCurrentPasswordLabel}</FieldLabel>
                  <Input autoComplete="current-password" id="totp-confirm-password" name="currentPassword" required type="password" />
                </Field>
                <Field data-invalid={confirmError ? true : undefined}>
                  <FieldLabel htmlFor="totp-confirm-code">{dictionary.profileTotpCodeLabel}</FieldLabel>
                  <OtpInput id="totp-confirm-code" name="code" />
                  {confirmError ? <FieldError>{dictionary.profileTotpWrongCode}</FieldError> : null}
                </Field>
              </FieldGroup>
              <div className="flex justify-end">
                <Button aria-busy={confirmPending || undefined} disabled={confirmPending} type="submit">
                  {confirmPending && <Spinner data-icon="inline-start" />}
                  {confirmPending ? dictionary.profileTotpConfirming : dictionary.profileTotpConfirm}
                </Button>
              </div>
            </form>
          </div>
        ) : null}
        {enrollment && enrollStep === "codes" ? (
          <div className="space-y-5">
            <RecoveryCodes
              codes={enrollment.recoveryCodes}
              copiedLabel={dictionary.copyFieldCopied}
              copyLabel={dictionary.profileTotpCopy}
              description={dictionary.profileTotpCodesStepBody}
              downloadLabel={dictionary.profileTotpDownload}
              onSavedChange={setCodesSaved}
              saved={codesSaved}
              savedLabel={dictionary.profileTotpSavedCodes}
              title={dictionary.profileTotpRecoveryCodesTitle}
            />
            <div className="flex justify-end">
              <Button disabled={!codesSaved} onClick={() => handleEnrollOpenChange(false)} type="button">
                {dictionary.profileTotpDone}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        closeLabel={dictionary.close}
        onOpenChange={handleRegenerateOpenChange}
        open={regenerateOpen}
        title={dictionary.profileTotpRecoveryCodesTitle}
      >
        {regeneratedCodes && (
          <div className="space-y-5">
            <RecoveryCodes
              codes={regeneratedCodes}
              copiedLabel={dictionary.copyFieldCopied}
              copyLabel={dictionary.profileTotpCopy}
              description={dictionary.profileTotpCodesStepBody}
              downloadLabel={dictionary.profileTotpDownload}
              onSavedChange={setCodesSaved}
              saved={codesSaved}
              savedLabel={dictionary.profileTotpSavedCodes}
              title={dictionary.profileTotpRecoveryCodesTitle}
            />
            <div className="flex justify-end">
              <Button disabled={!codesSaved} onClick={() => handleRegenerateOpenChange(false)} type="button">
                {dictionary.profileTotpDone}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        cancelLabel={dictionary.cancel}
        confirmLabel={dictionary.close}
        description={dictionary.profileTotpCloseWarning}
        destructive
        failureMessage={dictionary.totpFailed}
        onConfirm={confirmClose}
        onOpenChange={(open) => { if (!open) setCloseWarnTarget(null); }}
        open={closeWarnTarget !== null}
        pendingLabel={dictionary.loading}
        title={dictionary.close}
      />

      <ConfirmDialog
        cancelLabel={dictionary.cancel}
        confirmLabel={dictionary.profileTotpRegenerate}
        description={dictionary.profileTotpRegenerateBody}
        destructive={false}
        failureMessage={dictionary.totpFailed}
        onConfirm={handleRegenerate}
        onOpenChange={setRegenerateConfirmOpen}
        open={regenerateConfirmOpen}
        pendingLabel={dictionary.profileTotpRegenerating}
        title={dictionary.profileTotpRegenerateTitle}
      />

      <Modal
        closeLabel={dictionary.close}
        onOpenChange={setDisableOpen}
        open={disableOpen}
        title={dictionary.profileTotpDisableTitle}
      >
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">{dictionary.profileTotpDisableBody}</p>
          <form action="/profile/totp/disable" className="space-y-4" method="post">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="totp-disable-password">{dictionary.profileCurrentPasswordLabel}</FieldLabel>
                <Input autoComplete="current-password" id="totp-disable-password" name="currentPassword" required type="password" />
              </Field>
              <Field>
                <FieldLabel htmlFor="totp-disable-code">{dictionary.profileTotpCodeLabel}</FieldLabel>
                <OtpInput id="totp-disable-code" name="code" />
              </Field>
            </FieldGroup>
            <div className="flex justify-end">
              <Button type="submit" variant="destructive">{dictionary.profileTotpDisable}</Button>
            </div>
          </form>
        </div>
      </Modal>
    </Card>
  );
}
