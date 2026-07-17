import { cookies } from "next/headers";
import { AlertCircleIcon, CheckCircle2Icon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";

import { getAuthorizationService } from "@/auth/authorization";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { defaultLocale } from "@/i18n/locales";
import { NauttCredentialSurface } from "@/app/nautt-credential-surface";

export default async function DesignSystemPage() {
  const token = (await cookies()).get("qr_session")?.value;
  const principal = token ? await getAuthorizationService().resolve(token) : null;
  const locale = principal ? await getLocalePreferenceService().resolve(principal.id) : defaultLocale;
  const dictionary = getDictionary(locale);

  return <main className="ds-ledger">
    <header className="receipt-rail">
      <span className="receipt-rail__label">QR Pagamentos / radix-nova</span>
      <h1>{dictionary.designSystemHeading}</h1>
      <div className="receipt-rail__facts ds-facts"><span>IBM Plex Sans</span><span>{dictionary.designSystemRole}</span><span>{dictionary.designSystemState}</span></div>
    </header>
    <p className="admin-shell__intro" data-ds-prose>{dictionary.designSystemIntroduction}</p>

    <section aria-labelledby="ds-actions-title" className="ds-section" data-ds-section="actions">
      <div className="ds-section__heading"><h2 id="ds-actions-title">{dictionary.designSystemActions}</h2><p data-ds-prose>{dictionary.designSystemActionsDescription}</p></div>
      <div className="ds-row">
        <Button data-ds-hit-target type="button">{dictionary.designSystemPrimaryAction}</Button>
        <Button data-ds-hit-target type="button" variant="outline">{dictionary.designSystemSecondaryAction}</Button>
        <Button aria-busy disabled type="button" variant="outline"><Spinner data-icon="inline-start" />{dictionary.designSystemLoadingAction}</Button>
        <Button disabled type="button" variant="secondary">{dictionary.designSystemDisabledAction}</Button>
      </div>
    </section>

    <section aria-labelledby="ds-fields-title" className="ds-section" data-ds-section="fields">
      <div className="ds-section__heading"><h2 id="ds-fields-title">{dictionary.designSystemFieldsHeading}</h2><p data-ds-prose>{dictionary.designSystemFieldsDescription}</p></div>
      <FieldGroup className="ds-form">
        <Field><FieldLabel htmlFor="receipt-reference">{dictionary.designSystemFieldLabel}</FieldLabel><Input data-ds-hit-target id="receipt-reference" placeholder="PIX-2026-0716" /><FieldDescription>{dictionary.designSystemFieldHelp}</FieldDescription></Field>
        <Field data-invalid><FieldLabel htmlFor="receipt-reference-error">{dictionary.designSystemFieldLabel}</FieldLabel><Input aria-describedby="receipt-error" aria-invalid data-ds-hit-target id="receipt-reference-error" /><FieldError id="receipt-error">{dictionary.designSystemFieldError}</FieldError></Field>
        <Field><FieldLabel htmlFor="receipt-state">{dictionary.designSystemStatuses}</FieldLabel><NativeSelect data-ds-hit-target defaultValue="active" id="receipt-state"><NativeSelectOption value="active">{dictionary.designSystemState}</NativeSelectOption><NativeSelectOption value="review">{dictionary.designSystemWarning}</NativeSelectOption></NativeSelect></Field>
        <Field orientation="horizontal"><Checkbox data-ds-hit-target defaultChecked id="confirm-review" /><FieldLabel htmlFor="confirm-review">{dictionary.designSystemWarning}</FieldLabel></Field>
      </FieldGroup>
    </section>

    <section aria-labelledby="ds-feedback-title" className="ds-section" data-ds-section="feedback">
      <div className="ds-section__heading"><h2 id="ds-feedback-title">{dictionary.designSystemStatuses}</h2><p data-ds-prose>{dictionary.designSystemStatusesDescription}</p></div>
      <div className="ds-row"><Badge variant="secondary"><CheckCircle2Icon />{dictionary.designSystemState}</Badge><Badge variant="outline">PIX</Badge><Badge variant="destructive"><AlertCircleIcon />{dictionary.designSystemDanger}</Badge></div>
      <Alert data-ds-status variant="success"><CheckCircle2Icon aria-hidden data-ds-status-cue /><AlertTitle>{dictionary.designSystemSuccess}</AlertTitle><AlertDescription>{dictionary.designSystemState}</AlertDescription></Alert>
      <Alert data-ds-status variant="warning"><TriangleAlertIcon aria-hidden data-ds-status-cue /><AlertTitle>{dictionary.designSystemWarning}</AlertTitle><AlertDescription>{dictionary.designSystemFieldError}</AlertDescription></Alert>
      <Alert data-ds-status variant="destructive"><AlertCircleIcon aria-hidden data-ds-status-cue /><AlertTitle>{dictionary.designSystemDanger}</AlertTitle><AlertDescription>{dictionary.designSystemError}</AlertDescription></Alert>
    </section>

    <section aria-labelledby="ds-content-title" className="ds-section" data-ds-section="content">
      <div className="ds-section__heading"><h2 id="ds-content-title">{dictionary.designSystemContentHeading}</h2><p data-ds-prose>{dictionary.designSystemContentDescription}</p></div>
      <Card>
        <CardHeader><CardTitle>{dictionary.designSystemEmpty}</CardTitle><CardDescription>{dictionary.designSystemIntroduction}</CardDescription></CardHeader>
        <CardContent><p data-ds-prose>{dictionary.designSystemEmpty}</p></CardContent>
        <CardFooter><Button data-ds-hit-target type="button" variant="outline">{dictionary.designSystemRetry}</Button></CardFooter>
      </Card>
      <div aria-label={dictionary.designSystemLoadingAction} className="ds-skeletons" role="status"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-11 w-1/3" /></div>
      <Separator />
      <Table className="ds-facts"><TableCaption>{dictionary.designSystemStatuses}</TableCaption><TableHeader><TableRow><TableHead>PIX</TableHead><TableHead>{dictionary.designSystemState}</TableHead><TableHead>BRL</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>PIX-0716</TableCell><TableCell>{dictionary.designSystemSuccess}</TableCell><TableCell>128,40</TableCell></TableRow><TableRow><TableCell>PIX-0715</TableCell><TableCell>{dictionary.designSystemWarning}</TableCell><TableCell>72,00</TableCell></TableRow></TableBody></Table>
      <span className="sr-only"><LoaderCircleIcon />{dictionary.designSystemLoadingAction}</span>
    </section>
    <NauttCredentialSurface dictionary={dictionary} idPrefix="specimen-empty" notice="invalid" status={{ credential: { hasCredential: false, credentialRevision: null, webhookRegistrationState: null, updatedAt: null }, balance: null, balanceUnavailable: false }} />
    <NauttCredentialSurface dictionary={dictionary} idPrefix="specimen-pending" status={{ credential: { hasCredential: true, credentialRevision: "00000000-0000-4000-8000-000000000001", webhookRegistrationState: "UNREGISTERED", updatedAt: new Date("2026-07-17T20:00:00Z") }, balance: null, balanceUnavailable: false }} />
    <NauttCredentialSurface dictionary={dictionary} idPrefix="specimen-recovery" status={{ credential: { hasCredential: true, credentialRevision: "00000000-0000-4000-8000-000000000002", webhookRegistrationState: "INDETERMINATE", updatedAt: new Date("2026-07-17T20:00:00Z") }, balance: null, balanceUnavailable: false }} />
    <NauttCredentialSurface dictionary={dictionary} idPrefix="specimen-balance" notice="configured" status={{ credential: { hasCredential: true, credentialRevision: "00000000-0000-4000-8000-000000000003", webhookRegistrationState: "ACTIVE", updatedAt: new Date("2026-07-17T20:00:00Z") }, balance: { tokenSymbol: "USDT", tokenName: "Tether USD", networkName: "Polygon Mainnet", balance: "17.271189" }, balanceUnavailable: false }} />
    <NauttCredentialSurface dictionary={dictionary} idPrefix="specimen-unavailable" status={{ credential: { hasCredential: true, credentialRevision: "00000000-0000-4000-8000-000000000004", webhookRegistrationState: "ACTIVE", updatedAt: new Date("2026-07-17T20:00:00Z") }, balance: null, balanceUnavailable: true }} />
  </main>;
}
