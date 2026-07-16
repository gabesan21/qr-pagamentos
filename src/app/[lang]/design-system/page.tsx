import { notFound } from "next/navigation";

import { getDictionary } from "@/i18n/dictionaries";
import { isSupportedLocale } from "@/i18n/locales";
import { ActionButton } from "@/app/ui/action-button";
import { Field } from "@/app/ui/field";
import { Panel } from "@/app/ui/panel";
import { Status } from "@/app/ui/status";

export default async function DesignSystemPage({ params }: Readonly<{ params: Promise<{ lang: string }> }>) {
  const { lang } = await params;
  if (!isSupportedLocale(lang)) notFound();
  const dictionary = getDictionary(lang);

  return (
    <main className="admin-shell">
      <header className="receipt-rail">
        <span className="receipt-rail__label">QR Pagamentos / design system</span>
        <h1>{dictionary.designSystemHeading}</h1>
        <div className="receipt-rail__facts">
          <span>{dictionary.designSystemRole}</span>
          <span>{dictionary.designSystemState}</span>
        </div>
      </header>
      <p className="admin-shell__intro">{dictionary.designSystemIntroduction}</p>
      <div className="specimen-grid">
        <Panel title={dictionary.designSystemActions}>
          <ActionButton type="button">{dictionary.designSystemPrimaryAction}</ActionButton>
          <Field helpText={dictionary.designSystemFieldHelp} id="receipt-reference" label={dictionary.designSystemFieldLabel} />
          <Status label={dictionary.designSystemDanger} tone="danger">{dictionary.designSystemError}</Status>
          <ActionButton type="button" tone="secondary">{dictionary.designSystemRetry}</ActionButton>
          <ActionButton loading type="button">{dictionary.designSystemLoadingAction}</ActionButton>
          <ActionButton disabled type="button">{dictionary.designSystemDisabledAction}</ActionButton>
          <ActionButton type="button" tone="secondary">{dictionary.designSystemSecondaryAction}</ActionButton>
        </Panel>
        <Panel title={dictionary.designSystemStatuses}>
          <Status label={dictionary.designSystemSuccess} tone="success">{dictionary.designSystemState}</Status>
          <Status label={dictionary.designSystemWarning} tone="warning">{dictionary.designSystemFieldError}</Status>
          <Field error={dictionary.designSystemFieldError} id="receipt-reference-error" label={dictionary.designSystemFieldLabel} />
        </Panel>
        <Panel title={dictionary.designSystemEmpty}><p>{dictionary.designSystemEmpty}</p></Panel>
      </div>
    </main>
  );
}
