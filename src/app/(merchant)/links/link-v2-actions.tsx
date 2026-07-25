import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { getDictionary } from "@/i18n/dictionaries";

import { CatalogSubmit } from "../catalog/catalog-submit";

type Dictionary = ReturnType<typeof getDictionary>;

// Lifecycle mutation card on the V2 link detail: activate or deactivate behind
// an explicit confirmation, posting the delivered action vocabulary with the
// prefilled version CAS to `/payment-links-v2/[id]`.
export function PaymentLinkV2LifecycleCard({
  active,
  dictionary,
  id,
  version,
}: Readonly<{
  active: boolean;
  dictionary: Dictionary;
  id: string;
  version: number;
}>) {
  const heading = active ? dictionary.paymentLinkDeactivateHeading : dictionary.paymentLinkActivateHeading;
  const confirm = active ? dictionary.paymentLinkDeactivateConfirm : dictionary.paymentLinkActivateConfirm;
  const description = active ? dictionary.paymentLinkDeactivateDescription : dictionary.paymentLinkActivateDescription;
  const label = active ? dictionary.paymentLinkDeactivate : dictionary.paymentLinkActivate;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
      </CardHeader>
      <CardContent>
        <details>
          <summary>{confirm}</summary>
          <Alert variant="warning">
            <AlertTitle>{confirm}</AlertTitle>
            <AlertDescription>{description}</AlertDescription>
          </Alert>
          <form action={`/payment-links-v2/${id}`} method="post">
            <Input name="action" type="hidden" value={active ? "deactivate" : "activate"} />
            <Input name="version" type="hidden" value={version} />
            <CatalogSubmit label={label} tone={active ? "destructive" : "secondary"} />
          </form>
        </details>
      </CardContent>
    </Card>
  );
}
