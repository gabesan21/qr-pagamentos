"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";

import { NoticeToast, type NoticeToastEntry } from "@/app/notice-toast";

import { RecoveryCodes } from "./recovery-codes";
import { TotpQrCode } from "./totp-qr-code";

type TotpStatus = "none" | "pending" | "active";
type TotpNotice = "totp-enrolled" | "totp-confirmed" | "totp-disabled" | "totp-failed" | "totp-conflict" | null;

type TotpDictionary = {
  profileTotpTitle: string;
  profileTotpDescription: string;
  profileTotpNoneDescription: string;
  profileTotpEnroll: string;
  profileTotpEnrolling: string;
  profileTotpConfirmTitle: string;
  profileTotpConfirmDescription: string;
  profileTotpConfirm: string;
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
  profileTotpQrLabel: string;
  profileTotpQrCaption: string;
  profileCurrentPasswordLabel: string;
  profileTotpEnabledBadge: string;
  profileTotpStep1Title: string;
  profileTotpStep1Body: string;
  profileTotpStep2Title: string;
  profileTotpStep2Body: string;
  profileTotpContinue: string;
  profileTotpBack: string;
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

export function TotpSection({ dictionary, status, notice }: TotpSectionProps) {
  const [enrollment, setEnrollment] = useState<EnrollmentData | null>(null);
  const [regeneratedCodes, setRegeneratedCodes] = useState<string[] | null>(null);
  const [enrollStep, setEnrollStep] = useState<1 | 2>(1);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [codesSaved, setCodesSaved] = useState(false);
  const [closeWarnOpen, setCloseWarnOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [pending, setPending] = useState(false);

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
    setPending(true);
    try {
      const data = await postJson("/profile/totp/enroll");
      if (data && typeof data === "object" && "provisioningUri" in data && "recoveryCodes" in data) {
        setEnrollment(data as EnrollmentData);
        setCodesSaved(false);
        setEnrollStep(1);
        setEnrollOpen(true);
      }
    } catch {
      window.location.href = "/profile?totp=failed";
    } finally {
      setPending(false);
    }
  }

  async function handleRegenerate() {
    setPending(true);
    try {
      const data = await postJson("/profile/totp/regenerate");
      if (data && typeof data === "object" && "recoveryCodes" in data) {
        setRegeneratedCodes((data as { recoveryCodes: string[] }).recoveryCodes);
        setCodesSaved(false);
        setRegenerateOpen(true);
      }
    } catch {
      window.location.href = "/profile?totp=failed";
    } finally {
      setPending(false);
    }
  }

  function handleEnrollOpenChange(open: boolean) {
    if (!open && enrollStep === 1 && !codesSaved) {
      setCloseWarnOpen(true);
      return;
    }
    if (!open) {
      setEnrollment(null);
    }
    setEnrollOpen(open);
  }

  function confirmClose() {
    setCloseWarnOpen(false);
    setEnrollOpen(false);
    setEnrollment(null);
  }

  const enrollmentCodes = enrollment?.recoveryCodes ?? [];
  const resolvedStatus: TotpStatus = enrollment ? "pending" : status;

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
            <Button aria-busy={pending || undefined} disabled={pending} onClick={() => void handleEnroll()} type="button">
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? dictionary.profileTotpEnrolling : dictionary.profileTotpEnroll}
            </Button>
          </div>
        )}
        {resolvedStatus === "pending" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge label={dictionary.profileTotpEnabledBadge} tone="warning" />
              <p className="text-sm text-muted-foreground">
                {enrollment ? dictionary.profileTotpActiveDescription : dictionary.profileTotpPendingDescription}
              </p>
            </div>
            {enrollment ? (
              <Button
                onClick={() => {
                  setEnrollStep(codesSaved ? 2 : 1);
                  setEnrollOpen(true);
                }}
                type="button"
                variant="secondary"
              >
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
              <Button aria-busy={pending || undefined} disabled={pending} onClick={() => void handleRegenerate()} type="button" variant="secondary">
                {pending && !enrollOpen && <Spinner data-icon="inline-start" />}
                {pending ? dictionary.profileTotpRegenerating : dictionary.profileTotpRegenerate}
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
        footer={
          enrollStep === 1 ? (
            <Button disabled={!codesSaved} onClick={() => setEnrollStep(2)} type="button">
              {dictionary.profileTotpContinue}
            </Button>
          ) : (
            <Button onClick={() => { setEnrollStep(1); }} type="button" variant="ghost">
              {dictionary.profileTotpBack}
            </Button>
          )
        }
        onOpenChange={handleEnrollOpenChange}
        open={enrollOpen}
        title={enrollStep === 1 ? dictionary.profileTotpStep1Title : dictionary.profileTotpStep2Title}
      >
        <div className="space-y-5">
          {enrollStep === 1 ? (
            <RecoveryCodes
              codes={enrollmentCodes}
              copiedLabel={dictionary.copyFieldCopied}
              copyLabel={dictionary.copyFieldCopy}
              description={dictionary.profileTotpStep1Body}
              onSavedChange={setCodesSaved}
              saved={codesSaved}
              savedLabel={dictionary.profileTotpSavedCodes}
              title={dictionary.profileTotpRecoveryCodesTitle}
            />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{dictionary.profileTotpStep2Body}</p>
              <TotpQrCode caption={dictionary.profileTotpQrCaption} label={dictionary.profileTotpQrLabel} provisioningUri={enrollment!.provisioningUri} />
              <form action="/profile/totp/confirm" className="space-y-4" method="post">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="totp-confirm-password">{dictionary.profileCurrentPasswordLabel}</FieldLabel>
                    <Input autoComplete="current-password" id="totp-confirm-password" name="currentPassword" required type="password" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="totp-confirm-code">{dictionary.profileTotpCodeLabel}</FieldLabel>
                    <OtpInput id="totp-confirm-code" name="code" />
                  </Field>
                </FieldGroup>
                <div className="flex justify-end">
                  <Button type="submit">{dictionary.profileTotpConfirm}</Button>
                </div>
              </form>
            </>
          )}
        </div>
      </Modal>

      <Modal
        closeLabel={dictionary.close}
        footer={
          <Button disabled={!codesSaved} onClick={() => setRegenerateOpen(false)} type="button">
            {dictionary.profileTotpDone}
          </Button>
        }
        onOpenChange={(open) => {
          if (!open) setRegeneratedCodes(null);
          setRegenerateOpen(open);
        }}
        open={regenerateOpen}
        title={dictionary.profileTotpRecoveryCodesTitle}
      >
        {regeneratedCodes && (
          <RecoveryCodes
            codes={regeneratedCodes}
            copiedLabel={dictionary.copyFieldCopied}
            copyLabel={dictionary.copyFieldCopy}
            description={dictionary.profileTotpStep1Body}
            onSavedChange={setCodesSaved}
            saved={codesSaved}
            savedLabel={dictionary.profileTotpSavedCodes}
            title={dictionary.profileTotpRecoveryCodesTitle}
          />
        )}
      </Modal>

      <ConfirmDialog
        cancelLabel={dictionary.cancel}
        confirmLabel={dictionary.close}
        description={dictionary.profileTotpCloseWarning}
        failureMessage={dictionary.totpFailed}
        onConfirm={confirmClose}
        onOpenChange={setCloseWarnOpen}
        open={closeWarnOpen}
        pendingLabel={dictionary.loading}
        title={dictionary.close}
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
