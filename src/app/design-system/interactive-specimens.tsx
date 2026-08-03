"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { showToast, ToastViewport } from "@/components/ui/toast";

import { SpecimenBinding } from "./specimen-binding";

type Dictionary = Readonly<Record<string, string>>;

function BoundOtp({ disabled = false, invalid = false, label, ownerState, value = "" }: Readonly<{ disabled?: boolean; invalid?: boolean; label: string; ownerState: string; value?: string }>) {
  return <SpecimenBinding owner="input-otp" state={ownerState}><InputOTP aria-invalid={invalid || undefined} aria-label={label} disabled={disabled} maxLength={4} value={value}><InputOTPGroup><InputOTPSlot aria-invalid={invalid || undefined} index={0} /><InputOTPSlot aria-invalid={invalid || undefined} index={1} /></InputOTPGroup><InputOTPSeparator /><InputOTPGroup><InputOTPSlot aria-invalid={invalid || undefined} index={2} /><InputOTPSlot aria-invalid={invalid || undefined} index={3} /></InputOTPGroup></InputOTP></SpecimenBinding>;
}

export function DesignSystemInteractiveSpecimens({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  const [switched, setSwitched] = useState(false);
  const [otp, setOtp] = useState("12");
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [failureOpen, setFailureOpen] = useState(false);
  const [values, setValues] = useState<Record<SupportedLocale, string>>({ "pt-BR": dictionary.designSystemLocalizedPtValue, en: dictionary.designSystemLocalizedEnValue });

  function resetProbes() {
    toast.dismiss();
    setSwitched(false);
    setOtp("12");
    setModalOpen(false);
    setConfirmOpen(false);
    setFailureOpen(false);
  }

  useEffect(() => () => { toast.dismiss(); }, []);

  return <>
    <section aria-labelledby="actions" className="ds-section" data-ds-section="actions">
      <div className="ds-section__heading"><h2 id="actions">{dictionary.designSystemActions}</h2><p data-ds-prose>{dictionary.designSystemActionsDescription}</p></div>
      <div className="flex min-w-0 flex-wrap gap-3 [&_button]:h-auto [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:py-2" id="ds-primitive-button">
        <SpecimenBinding owner="button" state="default"><Button>{dictionary.designSystemPrimaryAction}</Button></SpecimenBinding>
        <SpecimenBinding owner="button" state="hover"><Button data-probe="hover" variant="secondary">{dictionary.designSystemSecondaryAction}</Button></SpecimenBinding>
        <SpecimenBinding owner="button" state="focus"><Button data-probe="focus" variant="outline">{dictionary.designSystemSecondaryAction}</Button></SpecimenBinding>
        <SpecimenBinding owner="button" state="loading"><Button aria-busy disabled><Spinner aria-hidden />{dictionary.designSystemLoadingAction}</Button></SpecimenBinding>
        <SpecimenBinding owner="button" state="disabled"><Button disabled>{dictionary.designSystemDisabledAction}</Button></SpecimenBinding>
      </div>
    </section>

    <section aria-labelledby="controls" className="ds-section" data-ds-section="controls">
      <div className="ds-section__heading"><h2 id="controls">{dictionary.designSystemControlsHeading}</h2><p data-ds-prose>{dictionary.designSystemControlsDescription}</p></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <FieldGroup id="ds-primitive-field">
          <Field><FieldLabel htmlFor="specimen-reference" id="ds-primitive-label">{dictionary.designSystemFieldLabel}</FieldLabel><div id="ds-primitive-input"><Input data-ds-hit-target defaultValue="FIX-2026-001" id="specimen-reference" /></div><FieldDescription>{dictionary.designSystemFieldHelp}</FieldDescription></Field>
          <Field data-invalid><FieldLabel htmlFor="specimen-invalid">{dictionary.designSystemInvalidLabel}</FieldLabel><Input aria-describedby="specimen-invalid-error" aria-invalid data-ds-hit-target id="specimen-invalid" /><FieldError id="specimen-invalid-error">{dictionary.designSystemFieldError}</FieldError></Field>
          <Field><FieldLabel htmlFor="specimen-select">{dictionary.designSystemSelectLabel}</FieldLabel><div id="ds-primitive-nativeselect"><NativeSelect data-ds-hit-target defaultValue="ready" id="specimen-select"><NativeSelectOption value="ready">{dictionary.designSystemReady}</NativeSelectOption><NativeSelectOption value="review">{dictionary.designSystemWarning}</NativeSelectOption></NativeSelect></div></Field>
          <Field><FieldLabel htmlFor="specimen-textarea">{dictionary.designSystemFieldHelp}</FieldLabel><div id="ds-primitive-textarea"><Textarea defaultValue="FIX-2026-001" id="specimen-textarea" /></div></Field>
          <div className="flex flex-wrap gap-3" id="ds-primitive-checkbox">
            <SpecimenBinding owner="checkbox" state="default"><Checkbox aria-label={`${dictionary.designSystemCheckboxLabel}: default`} /></SpecimenBinding>
            <SpecimenBinding owner="checkbox" state="checked"><Checkbox aria-label={`${dictionary.designSystemCheckboxLabel}: checked`} checked /></SpecimenBinding>
            <SpecimenBinding owner="checkbox" state="focus"><Checkbox aria-label={`${dictionary.designSystemCheckboxLabel}: focus`} data-probe="focus" /></SpecimenBinding>
            <SpecimenBinding owner="checkbox" state="invalid"><Checkbox aria-invalid aria-label={`${dictionary.designSystemCheckboxLabel}: invalid`} /></SpecimenBinding>
            <SpecimenBinding owner="checkbox" state="disabled"><Checkbox aria-label={`${dictionary.designSystemCheckboxLabel}: disabled`} disabled /></SpecimenBinding>
          </div>
          <div className="flex flex-wrap gap-3" id="ds-primitive-switch">
            <SpecimenBinding owner="switch" state="default"><Switch aria-label={`${dictionary.designSystemSwitchLabel}: default`} checked={switched} onCheckedChange={setSwitched} /></SpecimenBinding>
            <SpecimenBinding owner="switch" state="checked"><Switch aria-label={`${dictionary.designSystemSwitchLabel}: checked`} checked /></SpecimenBinding>
            <SpecimenBinding owner="switch" state="hover"><Switch aria-label={`${dictionary.designSystemSwitchLabel}: hover`} data-probe="hover" /></SpecimenBinding>
            <SpecimenBinding owner="switch" state="focus"><Switch aria-label={`${dictionary.designSystemSwitchLabel}: focus`} data-probe="focus" /></SpecimenBinding>
            <SpecimenBinding owner="switch" state="disabled"><Switch aria-label={`${dictionary.designSystemSwitchLabel}: disabled`} disabled /></SpecimenBinding>
          </div>
          <div className="flex flex-wrap gap-3" id="ds-primitive-inputotp">
            <BoundOtp label={`${dictionary.designSystemOtpLabel}: ${dictionary.designSystemDefaultState}`} ownerState="default" /><BoundOtp label={`${dictionary.designSystemOtpLabel}: ${dictionary.designSystemPopulatedState}`} ownerState="populated" value="1234" /><BoundOtp label={`${dictionary.designSystemOtpLabel}: ${dictionary.designSystemActiveState}`} ownerState="active" value={otp} /><BoundOtp label={`${dictionary.designSystemOtpLabel}: ${dictionary.designSystemFocusState}`} ownerState="focus" value={otp} /><BoundOtp invalid label={`${dictionary.designSystemOtpLabel}: ${dictionary.designSystemInvalidState}`} ownerState="invalid" value="1" /><BoundOtp disabled label={`${dictionary.designSystemOtpLabel}: ${dictionary.designSystemDisabledState}`} ownerState="disabled" value="12" />
          </div>
        </FieldGroup>
        <div className="grid gap-3">
          <SpecimenBinding owner="localized-field-group" state="default"><LocalizedFieldGroup id="specimen-localized" groupLabel={dictionary.designSystemLocalizedHeading} fields={{ "pt-BR": { localeLabel: dictionary.designSystemLocalePtBR, label: dictionary.designSystemLocalizedPtLabel, value: values["pt-BR"] }, en: { localeLabel: dictionary.designSystemLocaleEn, label: dictionary.designSystemLocalizedEnLabel, value: values.en } }} onValueChange={(locale, value) => setValues((current) => ({ ...current, [locale]: value }))} /></SpecimenBinding>
          {(["populated", "selected", "invalid", "focus", "disabled"] as const).map((state) => <SpecimenBinding key={state} owner="localized-field-group" state={state}><Input aria-invalid={state === "invalid" || undefined} defaultValue={state === "populated" ? dictionary.designSystemLocalizedEnValue : undefined} disabled={state === "disabled"} placeholder={dictionary.designSystemLocalizedHeading} /></SpecimenBinding>)}
        </div>
      </div>
    </section>

    <section aria-labelledby="interactions" className="ds-section" data-ds-section="interactions">
      <div className="ds-section__heading"><h2 id="interactions">{dictionary.designSystemInteractionsHeading}</h2><p data-ds-prose>{dictionary.designSystemInteractionsDescription}</p></div>
      <div className="grid gap-4" id="ds-primitive-sonner">
        <div className="flex min-w-0 flex-wrap gap-3 [&_button]:h-auto [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:py-2">
          {(["info", "success", "warning", "error"] as const).map((kind) => <SpecimenBinding key={kind} owner="toast" state={kind}><Button onClick={() => { toast.dismiss(); showToast({ kind, message: kind === "info" ? dictionary.designSystemInfo : kind === "success" ? dictionary.designSystemSuccess : kind === "warning" ? dictionary.designSystemWarning : dictionary.designSystemError, description: dictionary.designSystemToastDescription, dismissLabel: dictionary.designSystemDismiss }); }} variant="outline">{kind === "info" ? dictionary.designSystemInfo : kind === "success" ? dictionary.designSystemSuccess : kind === "warning" ? dictionary.designSystemWarning : dictionary.designSystemError}</Button></SpecimenBinding>)}
          <SpecimenBinding owner="toast" state="dismiss"><Button onClick={() => toast.dismiss()} variant="outline">{dictionary.designSystemDismiss}</Button></SpecimenBinding>
          <SpecimenBinding owner="toast" state="retry"><Button onClick={() => { toast.dismiss(); showToast({ kind: "error", message: dictionary.designSystemError, action: { label: dictionary.designSystemRetry, onClick: () => toast.dismiss() } }); }} variant="outline">{dictionary.designSystemRetry}</Button></SpecimenBinding>
          <Button data-probe-reset onClick={resetProbes} variant="ghost">{dictionary.designSystemDismiss}</Button>
        </div>
        <div className="grid gap-3" id="ds-primitive-copyfield">
          {(["ready", "pending", "copied", "failed", "focus", "disabled"] as const).map((state) => <SpecimenBinding key={state} owner="copy-field" state={state}><fieldset aria-disabled={state === "disabled"} className="min-w-0 max-w-full p-0 [&_button]:max-w-full" disabled={state === "disabled"}><CopyField labels={{ copy: dictionary.designSystemCopy, pending: dictionary.designSystemCopyPending, copied: dictionary.designSystemCopied, failed: dictionary.designSystemCopyFailed }} value={`fixture-${state}-redacted`} /></fieldset></SpecimenBinding>)}
        </div>
        <div className="min-w-0 max-w-full [&_[role=tablist]]:h-auto [&_[role=tablist]]:max-w-full [&_[role=tablist]]:flex-wrap [&_[role=tabpanel]]:min-w-0 [&_[role=tabpanel]]:max-w-full [&_[role=tabpanel]]:break-words" id="ds-primitive-tabs">{(["default", "selected", "hover", "focus", "disabled"] as const).map((state) => <SpecimenBinding key={state} owner="simple-tabs" state={state}><SimpleTabs label={dictionary.designSystemTabsLabel} tabs={[{ id: "ready", label: dictionary.designSystemTabsReadyLabel, content: <p>{dictionary.designSystemTabsReady}</p> }, { id: "review", label: dictionary.designSystemTabsReviewLabel, content: <p>{dictionary.designSystemTabsReview}</p> }, { id: "archived", label: dictionary.designSystemTabsArchivedLabel, content: <p>{dictionary.designSystemTabsArchived}</p>, disabled: true }]} /></SpecimenBinding>)}</div>
      </div>
      <div className="flex min-w-0 flex-wrap gap-3 [&_button]:h-auto [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:py-2 [&_button]:text-wrap" id="ds-primitive-dialog">
        <SpecimenBinding owner="modal" state="closed"><Button aria-expanded={false} variant="outline">{dictionary.designSystemOpenModal}</Button></SpecimenBinding>
        <SpecimenBinding owner="modal" state="open"><Button onClick={() => setModalOpen(true)} variant="outline">{dictionary.designSystemOpenModal}</Button></SpecimenBinding>
        <SpecimenBinding owner="modal" state="focus-loop"><Button onClick={() => setModalOpen(true)} variant="outline">{dictionary.designSystemModalDescription}</Button></SpecimenBinding>
        <span id="ds-primitive-alertdialog"><SpecimenBinding owner="modal" state="confirmation"><Button onClick={() => setConfirmOpen(true)} variant="destructive">{dictionary.designSystemOpenConfirm}</Button></SpecimenBinding></span>
        <SpecimenBinding owner="modal" state="pending"><Button onClick={() => setConfirmOpen(true)} variant="outline">{dictionary.designSystemPending}</Button></SpecimenBinding>
        <SpecimenBinding owner="modal" state="failed"><Button onClick={() => setFailureOpen(true)} variant="outline">{dictionary.designSystemConfirmFailure}</Button></SpecimenBinding>
        <SpecimenBinding owner="modal" state="disabled"><Button disabled>{dictionary.designSystemDisabledAction}</Button></SpecimenBinding>
        <SpecimenBinding owner="modal" state="focus-restored"><Button onClick={() => setModalOpen(true)} variant="outline">{dictionary.designSystemClose}</Button></SpecimenBinding>
      </div>
    </section>
    <Modal closeLabel={dictionary.designSystemClose} description={dictionary.designSystemModalDescription} footer={<Button onClick={() => setModalOpen(false)}>{dictionary.designSystemClose}</Button>} onOpenChange={setModalOpen} open={modalOpen} title={dictionary.designSystemModalTitle}><p>{dictionary.designSystemModalBody}</p></Modal>
    <ConfirmDialog cancelLabel={dictionary.designSystemCancel} confirmLabel={dictionary.designSystemConfirm} description={dictionary.designSystemConfirmDescription} failureMessage={dictionary.designSystemConfirmFailure} onConfirm={() => Promise.resolve()} onOpenChange={setConfirmOpen} open={confirmOpen} pendingLabel={dictionary.designSystemPending} title={dictionary.designSystemConfirmTitle} />
    <ConfirmDialog cancelLabel={dictionary.designSystemCancel} confirmLabel={dictionary.designSystemConfirm} description={dictionary.designSystemConfirmDescription} failureMessage={dictionary.designSystemConfirmFailure} onConfirm={() => Promise.reject(new Error("deterministic fixture"))} onOpenChange={setFailureOpen} open={failureOpen} pendingLabel={dictionary.designSystemPending} title={dictionary.designSystemConfirmTitle} />
    <ToastViewport label={dictionary.designSystemToastRegion} />
  </>;
}
