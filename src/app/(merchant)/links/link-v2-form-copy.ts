import type { getDictionary } from "@/i18n/dictionaries";

import type { LinkV2FormCopy } from "./link-v2-form";

type Dictionary = ReturnType<typeof getDictionary>;

// Every string the client form needs, drawn from the closed dictionary so the
// create/edit flows stay bilingual with no hardcoded copy.
export function linkV2FormCopy(dictionary: Dictionary, submit: string): LinkV2FormCopy {
  return {
    composition: dictionary.paymentLinkDirectoryColumnComposition,
    kindProductLines: dictionary.paymentLinkDirectoryKindProductLines,
    kindFixedAmount: dictionary.paymentLinkDirectoryKindFixedAmount,
    currencyPair: dictionary.adminPaymentLinkCurrencyPair,
    chooseCurrencyPair: dictionary.adminPaymentLinkChooseCurrencyPair,
    linkType: dictionary.adminPaymentLinkType,
    singleUse: dictionary.adminPaymentLinkSingleUse,
    reusable: dictionary.adminPaymentLinkReusable,
    expiry: dictionary.adminPaymentLinkExpiry,
    expiryHelp: dictionary.adminPaymentLinkExpiryHelp,
    descriptionPtBr: dictionary.paymentLinkDescriptionPtBr,
    descriptionEn: dictionary.paymentLinkDescriptionEn,
    descriptionHelp: dictionary.paymentLinkDescriptionHelp,
    amount: dictionary.paymentLinkDirectoryAmount,
    amountHelp: dictionary.adminProductPriceHelp,
    lines: dictionary.paymentLinkDirectoryLines,
    lineProduct: dictionary.adminPaymentLinkProduct,
    chooseProduct: dictionary.adminPaymentLinkChooseProduct,
    lineQuantity: dictionary.paymentLinkDirectoryQuantity,
    lineAdd: dictionary.paymentLinkLineAdd,
    lineRemove: dictionary.paymentLinkLineRemove,
    submit,
    productsUnavailable: dictionary.paymentLinkProductsUnavailable,
    productsUnavailableDescription: dictionary.paymentLinkProductsUnavailableDescription,
    pairsUnavailable: dictionary.paymentLinkPairsUnavailable,
    pairsUnavailableDescription: dictionary.paymentLinkPairsUnavailableDescription,
  };
}
