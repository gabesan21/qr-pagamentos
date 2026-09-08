import Link from "next/link";

import { FormDraftGuard } from "@/app/form-draft";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getPaymentLinkService } from "@/auth/payment-link";
import { getPaymentLinkV2PrefillService } from "@/auth/payment-link-v2-prefill";
import { getPaymentLinkV2ViewService } from "@/auth/payment-link-v2-view";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranchIcon } from "lucide-react";

import { requireMerchantShellContext } from "../../shell-context";
import { LINKS_NOTICE_KEY, parseLinksNotice, type LinksSearchParams } from "../directory-query";
import { linkV2FormCopy } from "../link-v2-form-copy";
import { LinkV2Form } from "../link-v2-form";
import type { LinkLineValue } from "../link-lines-editor";
import { PaymentLinkV2Notice } from "../links-notices";
import { PaymentLinkV2UnavailableCard } from "../link-v2-views";

function firstValue(value: string | readonly string[] | undefined) {
  return typeof value === "string" ? value : value?.[0];
}

// `/links/new?from=<id>` is the honest supersede path for attempt-locked
// compositions: kind, type, and the financial members are prefilled server-side
// from the current composition while the identifier, pair, and expiry are
// chosen fresh (the service generates the identifier; no identifier input
// exists anywhere). An unresolvable source shares the one opaque unavailable
// outcome.
export default async function NewPaymentLinkPage({
  searchParams = Promise.resolve({}),
}: Readonly<{
  searchParams?: Promise<LinksSearchParams>;
}> = {}) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const resolvedSearchParams = await searchParams;
  const from = firstValue(resolvedSearchParams.from);
  const notice = parseLinksNotice(resolvedSearchParams[LINKS_NOTICE_KEY]);

  const data = await getPaymentLinkService().listForOwner(principal);

  let initialKind: "PRODUCT_LINES" | "FIXED_AMOUNT" | undefined;
  let initialLinkType: "SINGLE_USE" | "REUSABLE" | undefined;
  let initialLines: readonly LinkLineValue[] | undefined;
  let fixedValues: { descriptionPtBr: string; descriptionEn: string; amount: string } | undefined;
  if (from !== undefined) {
    const [view, prefill] = await Promise.all([
      getPaymentLinkV2ViewService().getForOwner(principal, from),
      getPaymentLinkV2PrefillService().getForOwner(principal, from),
    ]);
    if (view.kind !== "found" || prefill === null) {
      return (
        <>
          <WorkspaceHeading description={dictionary.paymentLinkDirectoryDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.shellLinks} />
          <PaymentLinkV2UnavailableCard backHref="/links" dictionary={dictionary} />
        </>
      );
    }
    const { link } = view;
    initialKind = link.compositionKind;
    initialLinkType = link.linkType;
    if (link.compositionKind === "PRODUCT_LINES") {
      initialLines = link.lines.flatMap((line, index) => {
        const productId = prefill.lineProductIds[index];
        return productId === undefined ? [] : [{ productId, quantity: line.quantity }];
      });
    } else if (link.descriptionPtBr !== null && link.descriptionEn !== null && link.amount !== null) {
      fixedValues = { descriptionPtBr: link.descriptionPtBr, descriptionEn: link.descriptionEn, amount: link.amount };
    }
  }

  const products = data.activeProducts.map((product) => ({ id: product.id, titlePtBr: product.titlePtBr, titleEn: product.titleEn }));
  const pairs = data.activeCurrencyPairs.map((pair) => ({ id: pair.id, label: pair.label }));
  const description = from === undefined ? dictionary.paymentLinkCreateDescription : dictionary.paymentLinkCreateFromDescription;

  return (
    <div className="space-y-4">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link className="inline-flex min-h-11 items-center text-foreground underline-offset-4 hover:underline" href="/links">{dictionary.shellLinks}</Link>
        <span aria-hidden>›</span>
        <span className="text-foreground">{dictionary.paymentLinkCreateTitle}</span>
      </nav>

      <WorkspaceHeading description={description} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.paymentLinkCreateTitle} />

      {notice ? <PaymentLinkV2Notice dictionary={dictionary} notice={notice} /> : null}
      <FormDraftGuard
        draftKey="payment-link-v2-create"
        fieldNames={["descriptionPtBr", "descriptionEn", "amount", "expiresAt"]}
        formId="payment-link-v2-create"
        noticeKey={LINKS_NOTICE_KEY}
        noticeValues={["failed"]}
      />

      {from !== undefined ? (
        <Alert variant="default">
          <GitBranchIcon aria-hidden className="size-4" />
          <AlertTitle>{dictionary.paymentLinkNewVersion}</AlertTitle>
          <AlertDescription>{dictionary.paymentLinkNewVersionDescription}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{dictionary.paymentLinkCreateTitle}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <LinkV2Form
            action="/payment-links-v2"
            copy={linkV2FormCopy(dictionary, dictionary.paymentLinkCreateSubmit)}
            formId="payment-link-v2-create"
            {...(from !== undefined ? { from } : {})}
            {...(initialKind ? { initialKind } : {})}
            {...(initialLinkType ? { initialLinkType } : {})}
            {...(initialLines ? { initialLines } : {})}
            {...(fixedValues ? {
              initialAmount: fixedValues.amount,
              initialDescriptionEn: fixedValues.descriptionEn,
              initialDescriptionPtBr: fixedValues.descriptionPtBr,
            } : {})}
            locale={locale}
            mode="create"
            pairs={pairs}
            products={products}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button asChild data-ds-hit-target variant="outline">
          <Link href="/links">{dictionary.paymentLinkDirectoryBack}</Link>
        </Button>
      </div>
    </div>
  );
}
