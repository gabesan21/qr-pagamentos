"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon, CopyIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { showToast } from "@/components/ui/toast";

import { SpecimenBinding } from "./specimen-binding";
import "./specimen-state.module.css";

type Dictionary = Readonly<Record<string, string>>;

type CopyState = "ready" | "pending" | "copied" | "failed";

function CopyStateIcon({ state }: Readonly<{ state: CopyState }>) {
  if (state === "pending") return <LoaderCircleIcon aria-hidden="true" className="animate-spin" />;
  if (state === "copied") return <CheckIcon aria-hidden="true" />;
  if (state === "failed") return <TriangleAlertIcon aria-hidden="true" />;
  return <CopyIcon aria-hidden="true" />;
}

function ControlledCopyField({
  dictionary,
  state,
  value,
}: Readonly<{ dictionary: Dictionary; state: CopyState | "focus" | "disabled"; value: string }>) {
  const statusId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const copyState: CopyState = state === "focus" || state === "disabled" ? "ready" : state;
  const statusLabel = copyState === "ready" ? dictionary.designSystemCopy : dictionary[`designSystemCopy${copyState.charAt(0).toUpperCase()}${copyState.slice(1)}` as keyof Dictionary] ?? dictionary.designSystemCopy;

  useEffect(() => {
    if (state === "focus") buttonRef.current?.focus();
  }, [state]);

  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1" data-copy-state={state}>
      <Button
        ref={buttonRef}
        aria-describedby={statusId}
        aria-label={String(statusLabel)}
        className="max-w-full justify-start"
        data-probe={state === "focus" ? "focus" : undefined}
        disabled={state === "disabled" || copyState === "pending"}
        type="button"
        variant="outline"
      >
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{value}</span>
        <CopyStateIcon state={copyState} />
      </Button>
      <span
        aria-live={copyState === "failed" ? "assertive" : "polite"}
        className="sr-only"
        id={statusId}
        role={copyState === "failed" ? "alert" : "status"}
      >
        {String(statusLabel)}
      </span>
    </span>
  );
}

function BoundOtp({
  disabled = false,
  invalid = false,
  label,
  ownerState,
  value = "",
}: Readonly<{ disabled?: boolean; invalid?: boolean; label: string; ownerState: string; value?: string }>) {
  return (
    <SpecimenBinding owner="input-otp" state={ownerState}>
      <InputOTP aria-invalid={invalid || undefined} aria-label={label} disabled={disabled} maxLength={4} value={value}>
        <InputOTPGroup>
          <InputOTPSlot aria-invalid={invalid || undefined} index={0} />
          <InputOTPSlot aria-invalid={invalid || undefined} index={1} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot aria-invalid={invalid || undefined} index={2} />
          <InputOTPSlot aria-invalid={invalid || undefined} index={3} />
        </InputOTPGroup>
      </InputOTP>
    </SpecimenBinding>
  );
}

function LocalizedFieldGroupProbe({
  dictionary,
  state,
}: Readonly<{ dictionary: Dictionary; state: "default" | "populated" | "selected" | "invalid" | "focus" | "disabled" }>) {
  const [values, setValues] = useState<Record<SupportedLocale, string>>({
    "pt-BR": dictionary.designSystemLocalizedPtValue,
    en: dictionary.designSystemLocalizedEnValue,
  });
  const invalid = state === "invalid";
  const disabled = state === "disabled";

  useEffect(() => {
    const bindingId = `ds-localized-field-group-${state}`;
    if (state === "selected") {
      const tab = document.querySelector(`#${bindingId} [role="tab"][data-value="en"]`);
      (tab as HTMLElement | null)?.click();
    }
    if (state === "focus") {
      const input = document.querySelector(`#${bindingId} input`);
      (input as HTMLElement | null)?.focus();
    }
  }, [state]);

  return (
    <LocalizedFieldGroup
      disabled={disabled}
      fields={{
        "pt-BR": {
          localeLabel: dictionary.designSystemLocalePtBR,
          label: dictionary.designSystemLocalizedPtLabel,
          value: values["pt-BR"],
          error: invalid ? dictionary.designSystemFieldError : undefined,
        },
        en: {
          localeLabel: dictionary.designSystemLocaleEn,
          label: dictionary.designSystemLocalizedEnLabel,
          value: values.en,
          error: invalid ? dictionary.designSystemFieldError : undefined,
        },
      }}
      groupLabel={dictionary.designSystemLocalizedHeading}
      id={`specimen-localized-${state}`}
      onValueChange={(locale, value) => setValues((current) => ({ ...current, [locale]: value }))}
    />
  );
}

export function DesignSystemInteractiveSpecimens({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  const [switched, setSwitched] = useState(false);
  const [otp, setOtp] = useState("12");
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [failureOpen, setFailureOpen] = useState(false);

  function resetProbes() {
    toast.dismiss();
    setSwitched(false);
    setOtp("12");
    setModalOpen(false);
    setConfirmOpen(false);
    setPendingOpen(false);
    setFailureOpen(false);
  }

  useEffect(() => () => { toast.dismiss(); }, []);

  return (
    <>
      <section aria-labelledby="actions" className="ds-section" data-ds-section="actions">
        <div className="ds-section__heading"><h2 id="actions">{dictionary.designSystemActions}</h2><p data-ds-prose>{dictionary.designSystemActionsDescription}</p></div>
        <div className="flex min-w-0 flex-wrap gap-3 [&_button]:h-auto [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:py-2" id="ds-primitive-button">
          <SpecimenBinding owner="button" state="default"><Button>{dictionary.designSystemPrimaryAction}</Button></SpecimenBinding>
          <SpecimenBinding owner="button" state="hover"><Button data-probe="hover">{dictionary.designSystemPrimaryAction}</Button></SpecimenBinding>
          <SpecimenBinding owner="button" state="focus"><Button data-probe="focus">{dictionary.designSystemPrimaryAction}</Button></SpecimenBinding>
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
              <SpecimenBinding owner="checkbox" state="default"><Checkbox aria-label={`${dictionary.designSystemCheckboxLabel}: ${dictionary.designSystemDefaultState}`} /></SpecimenBinding>
              <SpecimenBinding owner="checkbox" state="checked"><Checkbox aria-label={`${dictionary.designSystemCheckboxLabel}: ${dictionary.designSystemCheckedState ?? "checked"}`} checked /></SpecimenBinding>
              <SpecimenBinding owner="checkbox" state="focus"><Checkbox aria-label={`${dictionary.designSystemCheckboxLabel}: ${dictionary.designSystemFocusState}`} data-probe="focus" /></SpecimenBinding>
              <SpecimenBinding owner="checkbox" state="invalid"><Checkbox aria-invalid aria-label={`${dictionary.designSystemCheckboxLabel}: ${dictionary.designSystemInvalidState}`} /></SpecimenBinding>
              <SpecimenBinding owner="checkbox" state="disabled"><Checkbox aria-label={`${dictionary.designSystemCheckboxLabel}: ${dictionary.designSystemDisabledState}`} disabled /></SpecimenBinding>
            </div>
            <div className="flex flex-wrap gap-3" id="ds-primitive-switch">
              <SpecimenBinding owner="switch" state="default"><Switch aria-label={`${dictionary.designSystemSwitchLabel}: ${dictionary.designSystemDefaultState}`} checked={switched} onCheckedChange={setSwitched} /></SpecimenBinding>
              <SpecimenBinding owner="switch" state="checked"><Switch aria-label={`${dictionary.designSystemSwitchLabel}: ${dictionary.designSystemCheckedState ?? "checked"}`} checked /></SpecimenBinding>
              <SpecimenBinding owner="switch" state="hover"><Switch aria-label={`${dictionary.designSystemSwitchLabel}: ${dictionary.designSystemHoverState ?? "hover"}`} data-probe="hover" /></SpecimenBinding>
              <SpecimenBinding owner="switch" state="focus"><Switch aria-label={`${dictionary.designSystemSwitchLabel}: ${dictionary.designSystemFocusState}`} data-probe="focus" /></SpecimenBinding>
              <SpecimenBinding owner="switch" state="disabled"><Switch aria-label={`${dictionary.designSystemSwitchLabel}: ${dictionary.designSystemDisabledState}`} disabled /></SpecimenBinding>
            </div>
            <div className="flex flex-wrap gap-3" id="ds-primitive-inputotp">
              <BoundOtp label={`${dictionary.designSystemOtpLabel}: ${dictionary.designSystemDefaultState}`} ownerState="default" />
              <BoundOtp label={`${dictionary.designSystemOtpLabel}: ${dictionary.designSystemPopulatedState}`} ownerState="populated" value="1234" />
              <BoundOtp label={`${dictionary.designSystemOtpLabel}: ${dictionary.designSystemActiveState}`} ownerState="active" value={otp} />
              <BoundOtp label={`${dictionary.designSystemOtpLabel}: ${dictionary.designSystemFocusState}`} ownerState="focus" value={otp} />
              <BoundOtp invalid label={`${dictionary.designSystemOtpLabel}: ${dictionary.designSystemInvalidState}`} ownerState="invalid" value="1" />
              <BoundOtp disabled label={`${dictionary.designSystemOtpLabel}: ${dictionary.designSystemDisabledState}`} ownerState="disabled" value="12" />
            </div>
          </FieldGroup>
          <div className="grid gap-3">
            <SpecimenBinding owner="localized-field-group" state="default"><LocalizedFieldGroupProbe dictionary={dictionary} state="default" /></SpecimenBinding>
            <SpecimenBinding owner="localized-field-group" state="populated"><LocalizedFieldGroupProbe dictionary={dictionary} state="populated" /></SpecimenBinding>
            <SpecimenBinding owner="localized-field-group" state="selected"><LocalizedFieldGroupProbe dictionary={dictionary} state="selected" /></SpecimenBinding>
            <SpecimenBinding owner="localized-field-group" state="invalid"><LocalizedFieldGroupProbe dictionary={dictionary} state="invalid" /></SpecimenBinding>
            <SpecimenBinding owner="localized-field-group" state="focus"><LocalizedFieldGroupProbe dictionary={dictionary} state="focus" /></SpecimenBinding>
            <SpecimenBinding owner="localized-field-group" state="disabled"><LocalizedFieldGroupProbe dictionary={dictionary} state="disabled" /></SpecimenBinding>
          </div>
        </div>
      </section>

      <section aria-labelledby="interactions" className="ds-section" data-ds-section="interactions">
        <div className="ds-section__heading"><h2 id="interactions">{dictionary.designSystemInteractionsHeading}</h2><p data-ds-prose>{dictionary.designSystemInteractionsDescription}</p></div>
        <div className="grid gap-4" id="ds-primitive-sonner">
          <div className="flex min-w-0 flex-wrap gap-3 [&_button]:h-auto [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:py-2">
            {(["info", "success", "warning", "error"] as const).map((kind) => (
              <SpecimenBinding key={kind} owner="toast" state={kind}>
                <Button
                  data-toast-kind={kind}
                  onClick={() => {
                    toast.dismiss();
                    showToast({
                      kind,
                      message: kind === "info" ? dictionary.designSystemInfo : kind === "success" ? dictionary.designSystemSuccess : kind === "warning" ? dictionary.designSystemWarning : dictionary.designSystemError,
                      description: dictionary.designSystemToastDescription,
                      dismissLabel: dictionary.designSystemDismiss,
                    });
                  }}
                  variant="outline"
                >
                  {kind === "info" ? dictionary.designSystemInfo : kind === "success" ? dictionary.designSystemSuccess : kind === "warning" ? dictionary.designSystemWarning : dictionary.designSystemError}
                </Button>
              </SpecimenBinding>
            ))}
            <SpecimenBinding owner="toast" state="dismiss"><Button data-toast-kind="dismiss" onClick={() => toast.dismiss()} variant="outline">{dictionary.designSystemDismiss}</Button></SpecimenBinding>
            <SpecimenBinding owner="toast" state="retry"><Button data-toast-kind="retry" onClick={() => { toast.dismiss(); showToast({ kind: "error", message: dictionary.designSystemError, action: { label: dictionary.designSystemRetry, onClick: () => toast.dismiss() } }); }} variant="outline">{dictionary.designSystemRetry}</Button></SpecimenBinding>
            <Button data-probe-reset onClick={resetProbes} variant="ghost">{dictionary.designSystemDismiss}</Button>
          </div>
          <div className="min-w-0 max-w-full p-0 [&_button]:max-w-full" id="ds-primitive-copyfield">
            <div className="grid gap-3">
              {(["ready", "pending", "copied", "failed", "focus", "disabled"] as const).map((state) => (
                <SpecimenBinding key={state} owner="copy-field" state={state}>
                  <ControlledCopyField dictionary={dictionary} state={state} value={`fixture-${state}-redacted`} />
                </SpecimenBinding>
              ))}
            </div>
          </div>
          <div className="min-w-0 max-w-full [&_[role=tablist]]:h-auto [&_[role=tablist]]:max-w-full [&_[role=tablist]]:flex-wrap [&_[role=tabpanel]]:min-w-0 [&_[role=tabpanel]]:max-w-full [&_[role=tabpanel]]:break-words" id="ds-primitive-tabs">
            {(["default", "selected", "hover", "focus", "disabled"] as const).map((state) => (
              <SpecimenBinding key={state} owner="simple-tabs" state={state}>
                <SimpleTabs
                  defaultValue={state === "selected" ? "review" : undefined}
                  label={dictionary.designSystemTabsLabel}
                  tabs={[
                    { id: "ready", label: dictionary.designSystemTabsReadyLabel, content: <p>{dictionary.designSystemTabsReady}</p> },
                    { id: "review", label: dictionary.designSystemTabsReviewLabel, content: <p>{dictionary.designSystemTabsReview}</p> },
                    { id: "archived", label: dictionary.designSystemTabsArchivedLabel, content: <p>{dictionary.designSystemTabsArchived}</p>, disabled: true },
                  ]}
                />
              </SpecimenBinding>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap gap-3 [&_button]:h-auto [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:py-2 [&_button]:text-wrap" id="ds-primitive-dialog">
          <SpecimenBinding owner="modal" state="closed"><Button aria-expanded={false} data-probe-modal="closed" variant="outline">{dictionary.designSystemOpenModal}</Button></SpecimenBinding>
          <SpecimenBinding owner="modal" state="open"><Button data-probe-modal="open" onClick={() => setModalOpen(true)} variant="outline">{dictionary.designSystemOpenModal}</Button></SpecimenBinding>
          <SpecimenBinding owner="modal" state="focus-loop"><Button data-probe-modal="focus-loop" onClick={() => setModalOpen(true)} variant="outline">{dictionary.designSystemModalDescription}</Button></SpecimenBinding>
          <span id="ds-primitive-alertdialog"><SpecimenBinding owner="modal" state="confirmation"><Button data-probe-modal="confirmation" onClick={() => setConfirmOpen(true)} variant="destructive">{dictionary.designSystemOpenConfirm}</Button></SpecimenBinding></span>
          <SpecimenBinding owner="modal" state="pending"><Button data-probe-modal="pending" onClick={() => setPendingOpen(true)} variant="outline">{dictionary.designSystemPending}</Button></SpecimenBinding>
          <SpecimenBinding owner="modal" state="failed"><Button data-probe-modal="failed" onClick={() => setFailureOpen(true)} variant="outline">{dictionary.designSystemConfirmFailure}</Button></SpecimenBinding>
          <SpecimenBinding owner="modal" state="disabled"><Button data-probe-modal="disabled" disabled>{dictionary.designSystemDisabledAction}</Button></SpecimenBinding>
          <SpecimenBinding owner="modal" state="focus-restored"><Button data-probe-modal="focus-restored" onClick={() => setModalOpen(true)} variant="outline">{dictionary.designSystemClose}</Button></SpecimenBinding>
        </div>
      </section>
      <Modal closeLabel={dictionary.designSystemClose} description={dictionary.designSystemModalDescription} footer={<Button onClick={() => setModalOpen(false)}>{dictionary.designSystemClose}</Button>} onOpenChange={setModalOpen} open={modalOpen} title={dictionary.designSystemModalTitle}><p>{dictionary.designSystemModalBody}</p></Modal>
      <ConfirmDialog cancelLabel={dictionary.designSystemCancel} confirmLabel={dictionary.designSystemConfirm} description={dictionary.designSystemConfirmDescription} failureMessage={dictionary.designSystemConfirmFailure} onConfirm={() => Promise.resolve()} onOpenChange={setConfirmOpen} open={confirmOpen} pendingLabel={dictionary.designSystemPending} title={dictionary.designSystemConfirmTitle} />
      <ConfirmDialog cancelLabel={dictionary.designSystemCancel} confirmLabel={dictionary.designSystemConfirm} description={dictionary.designSystemConfirmDescription} failureMessage={dictionary.designSystemConfirmFailure} onConfirm={() => new Promise<void>((resolve) => { setTimeout(resolve, 2_000); })} onOpenChange={setPendingOpen} open={pendingOpen} pendingLabel={dictionary.designSystemPending} title={dictionary.designSystemConfirmTitle} />
      <ConfirmDialog cancelLabel={dictionary.designSystemCancel} confirmLabel={dictionary.designSystemConfirm} description={dictionary.designSystemConfirmDescription} failureMessage={dictionary.designSystemConfirmFailure} onConfirm={() => Promise.reject(new Error("deterministic fixture"))} onOpenChange={setFailureOpen} open={failureOpen} pendingLabel={dictionary.designSystemPending} title={dictionary.designSystemConfirmTitle} />
    </>
  );
}
