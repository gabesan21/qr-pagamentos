import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { getDictionary } from "@/i18n/dictionaries";
import type { OwnerNauttStatus } from "@/integrations/nautt/owner-onboarding";
import Link from "next/link";

import { NauttCredentialSubmit } from "./nautt-credential-submit";

type Dictionary = ReturnType<typeof getDictionary>;

function Notice({ code, dictionary }: Readonly<{ code?: string; dictionary: Dictionary }>) {
  const copy = code === "configured" ? dictionary.nauttConfigured
    : code === "invalid" ? dictionary.nauttInvalid
      : code === "changed" ? dictionary.nauttChanged
        : code === "recovery" ? dictionary.nauttRecoveryRequired
          : code === "unavailable" ? dictionary.nauttUnavailable
            : null;
  if (!copy) return null;
  return <Alert role={code === "configured" ? "status" : "alert"} variant={code === "configured" ? "success" : "destructive"}>
    <AlertTitle>{dictionary.nauttHeading}</AlertTitle><AlertDescription>{copy}</AlertDescription>
  </Alert>;
}

function CredentialForm({ dictionary, idPrefix, secondary = false }: Readonly<{ dictionary: Dictionary; idPrefix: string; secondary?: boolean }>) {
  return <form action="/nautt-credentials" method="post">
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-api-key`}>{dictionary.nauttApiKeyLabel}</FieldLabel>
        <Input autoComplete="off" data-ds-hit-target id={`${idPrefix}-api-key`} name="apiKey" required type="password" />
        <FieldDescription>{dictionary.nauttApiKeyHelp}</FieldDescription>
      </Field>
      <NauttCredentialSubmit label={dictionary.nauttConnect} pendingLabel={dictionary.nauttConnecting} variant={secondary ? "outline" : "default"} />
    </FieldGroup>
  </form>;
}

export function NauttCredentialSurface({ dictionary, idPrefix = "nautt", notice, status }: Readonly<{
  dictionary: Dictionary;
  idPrefix?: string;
  notice?: string;
  status: OwnerNauttStatus;
}>) {
  const state = status.credential.webhookRegistrationState;
  return <section aria-labelledby={`${idPrefix}-heading`} className="ds-section" data-ds-section={idPrefix}>
    <div className="ds-section__heading"><h2 id={`${idPrefix}-heading`}>{dictionary.nauttHeading}</h2><p>{dictionary.nauttDescription}</p></div>
    <Notice code={notice} dictionary={dictionary} />
    {!status.credential.hasCredential ? <Card>
      <CardHeader><CardTitle>{dictionary.nauttHeading}</CardTitle><CardDescription>{dictionary.nauttApiKeyHelp}</CardDescription></CardHeader>
      <CardContent><CredentialForm dictionary={dictionary} idPrefix={idPrefix} /></CardContent>
    </Card> : null}
    {state === "UNREGISTERED" ? <>
      <Alert variant="warning"><AlertTitle>{dictionary.nauttRegistrationPending}</AlertTitle><AlertDescription>{dictionary.nauttApiKeyHelp}</AlertDescription></Alert>
      <form action="/nautt-credentials/register" method="post"><NauttCredentialSubmit label={dictionary.nauttCompleteRegistration} pendingLabel={dictionary.nauttCompletingRegistration} /></form>
      <Card><CardHeader><CardTitle>{dictionary.nauttApiKeyLabel}</CardTitle><CardDescription>{dictionary.nauttApiKeyHelp}</CardDescription></CardHeader><CardContent><CredentialForm dictionary={dictionary} idPrefix={idPrefix} secondary /></CardContent></Card>
    </> : null}
    {state === "REGISTERING" || state === "INDETERMINATE" ? <Alert variant="destructive"><AlertTitle>{dictionary.nauttRecoveryRequired}</AlertTitle><AlertDescription>{dictionary.nauttUnavailable}</AlertDescription></Alert> : null}
    {state === "ACTIVE" ? <Card>
      <CardHeader><CardTitle>{dictionary.nauttBalanceHeading}</CardTitle><CardDescription>{dictionary.nauttConfigured}</CardDescription></CardHeader>
      <CardContent>
        {status.balance ? <dl className="nautt-facts">
          <div><dt>{dictionary.nauttToken}</dt><dd>{status.balance.tokenName} ({status.balance.tokenSymbol})</dd></div>
          <div><dt>{dictionary.nauttNetwork}</dt><dd>{status.balance.networkName}</dd></div>
          <div><dt>{dictionary.nauttBalance}</dt><dd>{status.balance.balance} {status.balance.tokenSymbol}</dd></div>
        </dl> : <Alert variant="warning"><AlertTitle>{dictionary.nauttBalanceUnavailable}</AlertTitle><AlertDescription>{dictionary.nauttUnavailable}</AlertDescription></Alert>}
      </CardContent>
      {status.balanceUnavailable ? <CardFooter><Button asChild data-ds-hit-target variant="outline"><Link href="/">{dictionary.nauttRetryBalance}</Link></Button></CardFooter> : null}
    </Card> : null}
  </section>;
}
