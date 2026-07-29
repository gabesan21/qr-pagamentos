"use client";

import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { TotpQrCode } from "./totp-qr-code";

type TotpStatus = "none" | "pending" | "active";
type TotpNotice = "totp-enrolled" | "totp-confirmed" | "totp-disabled" | "totp-failed" | "totp-conflict" | null;

type TotpSectionProps = {
  dictionary: {
    profileTotpTitle: string;
    profileTotpDescription: string;
    profileTotpNoneTitle: string;
    profileTotpNoneDescription: string;
    profileTotpEnroll: string;
    profileTotpEnrolling: string;
    profileTotpConfirmTitle: string;
    profileTotpConfirmDescription: string;
    profileTotpConfirm: string;
    profileTotpConfirming: string;
    profileTotpActiveTitle: string;
    profileTotpActiveDescription: string;
    profileTotpDisable: string;
    profileTotpDisableDescription: string;
    profileTotpDisabling: string;
    profileTotpRegenerate: string;
    profileTotpRegenerating: string;
    profileTotpRecoveryCodesTitle: string;
    profileTotpRecoveryCodesDescription: string;
    profileTotpCopied: string;
    profileTotpCopy: string;
    profileTotpQrLabel: string;
    profileCurrentPasswordLabel: string;
    profilePasswordPlaceholder?: string;
    totpEnrolled: string;
    totpConfirmed: string;
    totpDisabled: string;
    totpFailed: string;
    totpConflict: string;
  };
  status: TotpStatus;
  notice: TotpNotice;
};

type EnrollmentData = { provisioningUri: string; recoveryCodes: string[] };

type RecoveryCodesProps = {
  codes: string[];
  copiedLabel: string;
  copyLabel: string;
  title: string;
};

function RecoveryCodes({ codes, copiedLabel, copyLabel, title }: Readonly<RecoveryCodesProps>) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="totp-recovery-codes">
      <ul aria-label={title} className="font-mono text-sm">
        {codes.map((code) => <li key={code}>{code}</li>)}
      </ul>
      <Button onClick={copy} type="button" variant="secondary">
        {copied ? copiedLabel : copyLabel}
      </Button>
    </div>
  );
}

export function TotpSection({ dictionary, status, notice }: Readonly<TotpSectionProps>) {
  const [enrollment, setEnrollment] = useState<EnrollmentData | null>(null);
  const [regeneratedCodes, setRegeneratedCodes] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  const resolvedStatus: TotpStatus = enrollment ? "pending" : status;
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
      }
    } catch {
      window.location.href = "/profile?totp=failed";
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.profileTotpTitle}</CardTitle>
        <CardDescription>{dictionary.profileTotpDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {noticeCopy && (
          <Alert role={notice === "totp-failed" || notice === "totp-conflict" ? "alert" : "status"} variant={notice === "totp-failed" || notice === "totp-conflict" ? "destructive" : "success"}>
            <AlertDescription>{noticeCopy}</AlertDescription>
          </Alert>
        )}
        {resolvedStatus === "none" && (
          <div className="space-y-4">
            <p className="text-muted-foreground">{dictionary.profileTotpNoneDescription}</p>
            <Button aria-busy={pending || undefined} disabled={pending} onClick={handleEnroll} type="button">
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? dictionary.profileTotpEnrolling : dictionary.profileTotpEnroll}
            </Button>
          </div>
        )}
        {(resolvedStatus === "pending" && enrollment) && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h4 className="font-medium">{dictionary.profileTotpRecoveryCodesTitle}</h4>
              <p className="text-sm text-muted-foreground">{dictionary.profileTotpRecoveryCodesDescription}</p>
              <RecoveryCodes
                codes={enrollment.recoveryCodes}
                copiedLabel={dictionary.profileTotpCopied}
                copyLabel={dictionary.profileTotpCopy}
                title={dictionary.profileTotpRecoveryCodesTitle}
              />
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">{dictionary.profileTotpConfirmTitle}</h4>
              <p className="text-sm text-muted-foreground">{dictionary.profileTotpConfirmDescription}</p>
              <TotpQrCode label={dictionary.profileTotpQrLabel} provisioningUri={enrollment.provisioningUri} />
            </div>
            <form action="/profile/totp/confirm" className="space-y-4" method="post">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="totp-confirm-password">{dictionary.profileCurrentPasswordLabel}</FieldLabel>
                  <Input autoComplete="current-password" id="totp-confirm-password" name="currentPassword" required type="password" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="totp-confirm-code">{dictionary.profileTotpConfirmTitle}</FieldLabel>
                  <Input autoComplete="one-time-code" id="totp-confirm-code" inputMode="numeric" maxLength={6} name="code" pattern="[0-9]*" required type="text" />
                </Field>
              </FieldGroup>
              <Button type="submit">{dictionary.profileTotpConfirm}</Button>
            </form>
          </div>
        )}
        {resolvedStatus === "pending" && !enrollment && (
          <form action="/profile/totp/confirm" className="space-y-4" method="post">
            <p className="text-muted-foreground">{dictionary.profileTotpConfirmDescription}</p>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="totp-confirm-password">{dictionary.profileCurrentPasswordLabel}</FieldLabel>
                <Input autoComplete="current-password" id="totp-confirm-password" name="currentPassword" required type="password" />
              </Field>
              <Field>
                <FieldLabel htmlFor="totp-confirm-code">{dictionary.profileTotpConfirmTitle}</FieldLabel>
                <Input autoComplete="one-time-code" id="totp-confirm-code" inputMode="numeric" maxLength={6} name="code" pattern="[0-9]*" required type="text" />
              </Field>
            </FieldGroup>
            <Button type="submit">{dictionary.profileTotpConfirm}</Button>
          </form>
        )}
        {resolvedStatus === "active" && (
          <div className="space-y-6">
            <p className="text-muted-foreground">{dictionary.profileTotpActiveDescription}</p>
            {regeneratedCodes && (
              <div className="space-y-2">
                <h4 className="font-medium">{dictionary.profileTotpRecoveryCodesTitle}</h4>
                <RecoveryCodes
                  codes={regeneratedCodes}
                  copiedLabel={dictionary.profileTotpCopied}
                  copyLabel={dictionary.profileTotpCopy}
                  title={dictionary.profileTotpRecoveryCodesTitle}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <Button aria-busy={pending || undefined} disabled={pending} onClick={handleRegenerate} type="button" variant="secondary">
                {pending && <Spinner data-icon="inline-start" />}
                {pending ? dictionary.profileTotpRegenerating : dictionary.profileTotpRegenerate}
              </Button>
            </div>
            <form action="/profile/totp/disable" className="space-y-4" method="post">
              <p className="text-muted-foreground">{dictionary.profileTotpDisableDescription}</p>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="totp-disable-password">{dictionary.profileCurrentPasswordLabel}</FieldLabel>
                  <Input autoComplete="current-password" id="totp-disable-password" name="currentPassword" required type="password" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="totp-disable-code">{dictionary.profileTotpConfirmTitle}</FieldLabel>
                  <Input autoComplete="one-time-code" id="totp-disable-code" inputMode="numeric" maxLength={64} name="code" required type="text" />
                </Field>
              </FieldGroup>
              <Button type="submit" variant="destructive">{dictionary.profileTotpDisable}</Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
