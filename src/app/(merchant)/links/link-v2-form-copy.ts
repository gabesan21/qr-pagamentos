import type { getDictionary } from "@/i18n/dictionaries";

import type { LinkV2FormCopy } from "./link-v2-form";

type Dictionary = ReturnType<typeof getDictionary>;

// Every string the client form needs, drawn from the closed dictionary so the
// create/edit flows stay bilingual with no hardcoded copy. Reuses the
// pre-existing `payment-links`/`payment-links-directory` labels for anything
// unchanged by 14.5.2 and draws every new/changed string from the new
// `payment-links-form` domain.
export function linkV2FormCopy(dictionary: Dictionary, submit: string): LinkV2FormCopy {
  return {
    add: dictionary.paymentLinkLineAdd,
    alreadyAdded: dictionary.paymentLinksFormProductAlreadyAdded,
    amount: dictionary.paymentLinkDirectoryAmount,
    amountHelp: dictionary.adminProductPriceHelp,
    amountInvalid: dictionary.paymentLinksFormAmountInvalid,
    chooseCurrencyPair: dictionary.adminPaymentLinkChooseCurrencyPair,
    chooseProduct: dictionary.adminPaymentLinkChooseProduct,
    composition: dictionary.paymentLinkDirectoryColumnComposition,
    compositionFixedAmountCaption: dictionary.paymentLinksFormCompositionFixedAmountCaption,
    compositionProductLinesCaption: dictionary.paymentLinksFormCompositionProductLinesCaption,
    conflictBody: dictionary.paymentLinksFormConflictBody,
    conflictReload: dictionary.paymentLinksFormConflictReload,
    conflictRetry: dictionary.paymentLinksFormConflictRetry,
    conflictTitle: dictionary.paymentLinksFormConflictTitle,
    currencyPair: dictionary.adminPaymentLinkCurrencyPair,
    descriptionEn: dictionary.paymentLinkDescriptionEn,
    descriptionHelp: dictionary.paymentLinkDescriptionHelp,
    descriptionPtBr: dictionary.paymentLinkDescriptionPtBr,
    descriptionsHeading: dictionary.paymentLinksFormDescriptionsHeading,
    descriptionsProductLinesCaption: dictionary.paymentLinksFormDescriptionsProductLinesCaption,
    expiry: dictionary.adminPaymentLinkExpiry,
    expiryClear: dictionary.paymentLinksFormExpiryClear,
    expiryHelp: dictionary.adminPaymentLinkExpiryHelp,
    financialLockDescription: dictionary.paymentLinkLockDescription,
    financialLockTitle: dictionary.paymentLinkLockTitle,
    kindFixedAmount: dictionary.paymentLinkDirectoryKindFixedAmount,
    kindProductLines: dictionary.paymentLinkDirectoryKindProductLines,
    lineRemove: dictionary.paymentLinkLineRemove,
    lineTotal: dictionary.paymentLinkDetailLineTotal,
    lines: dictionary.paymentLinkDirectoryLines,
    linkType: dictionary.adminPaymentLinkType,
    pairsUnavailable: dictionary.paymentLinkPairsUnavailable,
    pairsUnavailableCta: dictionary.paymentLinksFormPairsCta,
    pairsUnavailableDescription: dictionary.paymentLinkPairsUnavailableDescription,
    previewComposition: dictionary.paymentLinksFormPreviewComposition,
    previewCurrency: dictionary.paymentLinksFormPreviewCurrency,
    previewEmpty: dictionary.paymentLinksFormPreviewEmpty,
    previewExpiry: dictionary.paymentLinksFormPreviewExpiry,
    previewLines: dictionary.paymentLinksFormPreviewLines,
    previewNoExpiry: dictionary.paymentLinksFormPreviewNoExpiry,
    previewTitle: dictionary.paymentLinksFormPreviewTitle,
    previewTotal: dictionary.paymentLinksFormPreviewTotal,
    previewType: dictionary.paymentLinksFormPreviewType,
    productsUnavailable: dictionary.paymentLinkProductsUnavailable,
    productsUnavailableCta: dictionary.paymentLinksFormProductsCta,
    productsUnavailableDescription: dictionary.paymentLinkProductsUnavailableDescription,
    quantity: dictionary.paymentLinkDirectoryQuantity,
    quantityDecrease: dictionary.paymentLinksFormQuantityDecrease,
    quantityIncrease: dictionary.paymentLinksFormQuantityIncrease,
    reusable: dictionary.adminPaymentLinkReusable,
    runningTotal: dictionary.paymentLinksFormRunningTotal,
    searchLabel: dictionary.paymentLinksFormProductSearchLabel,
    searchPlaceholder: dictionary.paymentLinksFormProductSearchPlaceholder,
    singleUse: dictionary.adminPaymentLinkSingleUse,
    structuralLockNote: dictionary.paymentLinksFormStructuralLockNote,
    submit,
    typeReusableCaption: dictionary.paymentLinksFormTypeReusableCaption,
    typeSingleUseCaption: dictionary.paymentLinksFormTypeSingleUseCaption,
    unavailable: dictionary.paymentLinksFormLineUnavailable,
    unitPrice: dictionary.paymentLinkDirectoryUnitPrice,
    validationBody: dictionary.paymentLinksFormValidationBody,
    validationHeading: dictionary.paymentLinksFormValidationHeading,
  };
}
