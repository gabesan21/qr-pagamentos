import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import type { getDictionary } from "@/i18n/dictionaries";
import type { OwnerNauttStatus } from "@/integrations/nautt/owner-onboarding";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import Link from "next/link";

import { NoticeToast, type NoticeToastEntry } from "@/app/notice-toast";

import { NauttCredentialSubmit } from "./nautt-credential-submit";
import { NauttPendingScope } from "./nautt-pending-scope";

type Dictionary = ReturnType<typeof getDictionary>;

function StatusIntro({ dictionary, state }: Readonly<{ dictionary: Dictionary; state: string | null }>) {
  if (state === "ACTIVE") {
    return <StatusBadge label={dictionary.nauttStatusActive} tone="success" />;
  }
  if (state === "UNREGISTERED") {
    return <StatusBadge label={dictionary.nauttStatusUnregistered} tone="warning" />;
  }
  if (state === "REGISTERING" || state === "INDETERMINATE") {
    return <StatusBadge label={dictionary.nauttStatusIndeterminate} tone="danger" />;
  }
  return <StatusBadge label={dictionary.nauttStatusNotConfigured} tone="neutral" />;
}

function Notice({ code, dictionary }: Readonly<{ code?: string; dictionary: Dictionary }>) {
  const copy =
    code === "configured"
      ? dictionary.nauttConfigured
      : code === "invalid"
        ? dictionary.nauttInvalid
        : code === "changed"
          ? dictionary.nauttChanged
          : code === "recovery"
            ? dictionary.nauttRecoveryRequired
            : code === "reset"
              ? dictionary.nauttResetDone
              : code === "unavailable"
                ? dictionary.nauttUnavailable
                : null;
  if (!copy) return null;
  const success = code === "configured" || code === "reset";
  const entry: NoticeToastEntry = { param: "nautt", value: code!, kind: success ? "success" : "error", message: copy };
  return (
    <>
      <NoticeToast notices={[entry]} />
      <noscript>
        <Alert role={success ? "status" : "alert"} variant={success ? "success" : "destructive"}>
          <AlertTitle>{dictionary.nauttHeading}</AlertTitle>
          <AlertDescription>{copy}</AlertDescription>
        </Alert>
      </noscript>
    </>
  );
}

function CredentialForm({ dictionary, idPrefix, secondary = false }: Readonly<{ dictionary: Dictionary; idPrefix: string; secondary?: boolean }>) {
  const formId = `${idPrefix}-credential-form`;
  const [showKey, setShowKey] = useState(false);
  return (
    <form action="/nautt-credentials" id={formId} method="post">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-api-key`}>{dictionary.nauttApiKeyLabel}</FieldLabel>
          <div className="relative">
            <Input
              autoComplete="off"
              data-ds-hit-target
              data-nautt-action-control
              id={`${idPrefix}-api-key`}
              name="apiKey"
              required
              type={showKey ? "text" : "password"}
            />
            <button
              aria-label={showKey ? dictionary.hidePassword : dictionary.showPassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              onClick={() => setShowKey((s) => !s)}
              type="button"
            >
              {showKey ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
          </div>
          <FieldDescription>{dictionary.nauttApiKeyHelp}</FieldDescription>
        </Field>
        <NauttCredentialSubmit
          form={formId}
          label={dictionary.nauttConnect}
          pendingLabel={dictionary.nauttConnecting}
          variant={secondary ? "outline" : "default"}
        />
      </FieldGroup>
    </form>
  );
}

export function NauttCredentialSurface({
  dictionary,
  idPrefix = "nautt",
  notice,
  status,
}: Readonly<{
  dictionary: Dictionary;
  idPrefix?: string;
  notice?: string;
  status: OwnerNauttStatus;
}>) {
  const state = status.credential.webhookRegistrationState;
  const hasCredential = status.credential.hasCredential;

  return (
    <NauttPendingScope>
      <Notice code={notice} dictionary={dictionary} />
      {!hasCredential ? (
        <Card>
          <CardHeader>
            <CardTitle>{dictionary.nauttHeading}</CardTitle>
            <CardDescription>{dictionary.nauttApiKeyHelp}</CardDescription>
          </CardHeader>
          <CardContent>
            <CredentialForm dictionary={dictionary} idPrefix={idPrefix} />
          </CardContent>
        </Card>
      ) : null}

      {state === "UNREGISTERED" ? (
        <div className="space-y-4">
          <Alert variant="warning">
            <AlertTitle>{dictionary.nauttRegistrationPending}</AlertTitle>
            <AlertDescription>{dictionary.nauttApiKeyHelp}</AlertDescription>
          </Alert>
          <form action="/nautt-credentials/register" id={`${idPrefix}-registration-form`} method="post">
            <NauttCredentialSubmit
              form={`${idPrefix}-registration-form`}
              label={dictionary.nauttCompleteRegistration}
              pendingLabel={dictionary.nauttCompletingRegistration}
            />
          </form>
          <Card>
            <CardHeader>
              <CardTitle>{dictionary.nauttApiKeyLabel}</CardTitle>
              <CardDescription>{dictionary.nauttApiKeyHelp}</CardDescription>
            </CardHeader>
            <CardContent>
              <CredentialForm dictionary={dictionary} idPrefix={idPrefix} secondary />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {state === "REGISTERING" || state === "INDETERMINATE" ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle>{dictionary.nauttHeading}</CardTitle>
              <StatusIntro dictionary={dictionary} state={state} />
            </div>
            <CardDescription>{dictionary.nauttApiKeyHelp}</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertTitle>{dictionary.nauttRecoveryRequired}</AlertTitle>
              <AlertDescription>{dictionary.nauttResetDisclosure}</AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter>
            <form action="/nautt-credentials/reset" id={`${idPrefix}-reset-form`} method="post">
              <NauttCredentialSubmit
                form={`${idPrefix}-reset-form`}
                label={dictionary.nauttReset}
                pendingLabel={dictionary.nauttResetting}
                variant="outline"
              />
            </form>
          </CardFooter>
        </Card>
      ) : null}

      {state === "ACTIVE" ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle>{dictionary.nauttBalanceHeading}</CardTitle>
              <StatusIntro dictionary={dictionary} state={state} />
            </div>
            <CardDescription>{dictionary.nauttConfigured}</CardDescription>
          </CardHeader>
          <CardContent>
            {status.balance ? (
              <dl className="nautt-facts">
                <div>
                  <dt>{dictionary.nauttToken}</dt>
                  <dd>
                    {status.balance.tokenName} ({status.balance.tokenSymbol})
                  </dd>
                </div>
                <div>
                  <dt>{dictionary.nauttNetwork}</dt>
                  <dd>{status.balance.networkName}</dd>
                </div>
                <div>
                  <dt>{dictionary.nauttBalance}</dt>
                  <dd>
                    {status.balance.balance} {status.balance.tokenSymbol}
                  </dd>
                </div>
              </dl>
            ) : (
              <Alert variant="warning">
                <AlertTitle>{dictionary.nauttBalanceUnavailable}</AlertTitle>
                <AlertDescription>{dictionary.nauttUnavailable}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          {status.balanceUnavailable ? (
            <CardFooter>
              <Button asChild data-ds-hit-target variant="outline">
                <Link href="/settings">{dictionary.nauttRetryBalance}</Link>
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      ) : null}
    </NauttPendingScope>
  );
}
