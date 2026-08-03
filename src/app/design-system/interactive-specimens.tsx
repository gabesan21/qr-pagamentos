"use client";

import { useState } from "react";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyField } from "@/components/ui/copy-field";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { LocalizedFieldGroup, type SupportedLocale } from "@/components/ui/localized-field-group";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SimpleTabs } from "@/components/ui/simple-tabs";
import { Switch } from "@/components/ui/switch";
import { showToast, ToastViewport } from "@/components/ui/toast";

type Dictionary = Readonly<Record<string, string>>;

export function DesignSystemInteractiveSpecimens({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  const [checked, setChecked] = useState(true);
  const [switched, setSwitched] = useState(false);
  const [otp, setOtp] = useState("12");
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [values, setValues] = useState<Record<SupportedLocale, string>>({ "pt-BR": dictionary.designSystemLocalizedPtValue, en: dictionary.designSystemLocalizedEnValue });

  return <>
    <section aria-labelledby="controls" className="ds-section" data-ds-section="controls">
      <div className="ds-section__heading"><h2 id="controls">{dictionary.designSystemControlsHeading}</h2><p data-ds-prose>{dictionary.designSystemControlsDescription}</p></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <FieldGroup>
          <Field><FieldLabel htmlFor="specimen-reference">{dictionary.designSystemFieldLabel}</FieldLabel><Input data-ds-hit-target defaultValue="FIX-2026-001" id="specimen-reference" /><FieldDescription>{dictionary.designSystemFieldHelp}</FieldDescription></Field>
          <Field data-invalid><FieldLabel htmlFor="specimen-invalid">{dictionary.designSystemInvalidLabel}</FieldLabel><Input aria-describedby="specimen-invalid-error" aria-invalid data-ds-hit-target id="specimen-invalid" /><FieldError id="specimen-invalid-error">{dictionary.designSystemFieldError}</FieldError></Field>
          <Field><FieldLabel htmlFor="specimen-select">{dictionary.designSystemSelectLabel}</FieldLabel><NativeSelect data-ds-hit-target defaultValue="ready" id="specimen-select"><NativeSelectOption value="ready">{dictionary.designSystemReady}</NativeSelectOption><NativeSelectOption value="review">{dictionary.designSystemWarning}</NativeSelectOption></NativeSelect></Field>
          <Field orientation="horizontal"><Checkbox checked={checked} data-ds-hit-target id="specimen-checkbox" onCheckedChange={(value) => setChecked(value === true)} /><FieldLabel htmlFor="specimen-checkbox">{dictionary.designSystemCheckboxLabel}</FieldLabel></Field>
          <Field orientation="horizontal"><Switch aria-label={dictionary.designSystemSwitchLabel} checked={switched} data-ds-hit-target id="specimen-switch" onCheckedChange={setSwitched} /><FieldLabel htmlFor="specimen-switch">{dictionary.designSystemSwitchLabel}</FieldLabel></Field>
          <Field><FieldLabel htmlFor="specimen-otp">{dictionary.designSystemOtpLabel}</FieldLabel><InputOTP data-ds-hit-target id="specimen-otp" maxLength={4} onChange={setOtp} value={otp}><InputOTPGroup><InputOTPSlot index={0} /><InputOTPSlot index={1} /></InputOTPGroup><InputOTPSeparator /><InputOTPGroup><InputOTPSlot index={2} /><InputOTPSlot index={3} /></InputOTPGroup></InputOTP></Field>
        </FieldGroup>
        <LocalizedFieldGroup id="specimen-localized" groupLabel={dictionary.designSystemLocalizedHeading} fields={{ "pt-BR": { localeLabel: dictionary.designSystemLocalePtBR, label: dictionary.designSystemLocalizedPtLabel, value: values["pt-BR"], description: dictionary.designSystemLocalizedDescription }, en: { localeLabel: dictionary.designSystemLocaleEn, label: dictionary.designSystemLocalizedEnLabel, value: values.en, description: dictionary.designSystemLocalizedDescription } }} onValueChange={(locale, value) => setValues((current) => ({ ...current, [locale]: value }))} required />
      </div>
    </section>

    <section aria-labelledby="interactions" className="ds-section" data-ds-section="interactions">
      <div className="ds-section__heading"><h2 id="interactions">{dictionary.designSystemInteractionsHeading}</h2><p data-ds-prose>{dictionary.designSystemInteractionsDescription}</p></div>
      <div className="flex flex-wrap gap-3">
        <Button data-ds-hit-target onClick={() => showToast({ kind: "success", message: dictionary.designSystemToastSuccess, description: dictionary.designSystemToastDescription, dismissLabel: dictionary.designSystemDismiss })}><CheckIcon data-icon="inline-start" />{dictionary.designSystemToastAction}</Button>
        <Button data-ds-hit-target onClick={() => setModalOpen(true)} variant="outline">{dictionary.designSystemOpenModal}</Button>
        <Button data-ds-hit-target onClick={() => setConfirmOpen(true)} variant="destructive">{dictionary.designSystemOpenConfirm}</Button>
      </div>
      <CopyField labels={{ copy: dictionary.designSystemCopy, pending: dictionary.designSystemCopyPending, copied: dictionary.designSystemCopied, failed: dictionary.designSystemCopyFailed }} value="fixture-value-redacted" />
      <SimpleTabs label={dictionary.designSystemTabsLabel} tabs={[{ id: "ready", label: dictionary.designSystemTabsReadyLabel, count: 2, content: <p>{dictionary.designSystemTabsReady}</p> }, { id: "review", label: dictionary.designSystemTabsReviewLabel, content: <p>{dictionary.designSystemTabsReview}</p> }, { id: "archived", label: dictionary.designSystemTabsArchivedLabel, content: <p>{dictionary.designSystemTabsArchived}</p>, disabled: true }]} />
    </section>
    <Modal closeLabel={dictionary.designSystemClose} description={dictionary.designSystemModalDescription} footer={<Button onClick={() => setModalOpen(false)}>{dictionary.designSystemClose}</Button>} onOpenChange={setModalOpen} open={modalOpen} title={dictionary.designSystemModalTitle}><p>{dictionary.designSystemModalBody}</p></Modal>
    <ConfirmDialog cancelLabel={dictionary.designSystemCancel} confirmLabel={dictionary.designSystemConfirm} description={dictionary.designSystemConfirmDescription} failureMessage={dictionary.designSystemConfirmFailure} onConfirm={() => Promise.resolve()} onOpenChange={setConfirmOpen} open={confirmOpen} pendingLabel={dictionary.designSystemPending} title={dictionary.designSystemConfirmTitle} />
    <ToastViewport label={dictionary.designSystemToastRegion} />
  </>;
}
