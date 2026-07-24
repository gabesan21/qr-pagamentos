import { administrationEn } from "./administration/en";
import { administrationPtBR } from "./administration/pt-BR";
import { checkoutEn } from "./checkout/en";
import { checkoutPtBR } from "./checkout/pt-BR";
import { checkoutPolicyEn } from "./checkout-policy/en";
import { checkoutPolicyPtBR } from "./checkout-policy/pt-BR";
import { designSystemEn } from "./design-system/en";
import { designSystemPtBR } from "./design-system/pt-BR";
import { dataDirectoryEn } from "./data-directory/en";
import { dataDirectoryPtBR } from "./data-directory/pt-BR";
import { nauttEn } from "./nautt/en";
import { nauttPtBR } from "./nautt/pt-BR";
import { ordersEn } from "./orders/en";
import { ordersPtBR } from "./orders/pt-BR";
import { paymentLinksEn } from "./payment-links/en";
import { paymentLinksPtBR } from "./payment-links/pt-BR";
import { productsEn } from "./products/en";
import { productsPtBR } from "./products/pt-BR";
import { sharedEn } from "./shared/en";
import { sharedPtBR } from "./shared/pt-BR";
import { storefrontEn } from "./storefront/en";
import { storefrontPtBR } from "./storefront/pt-BR";

export const dictionaryDomains = {
  administration: { en: administrationEn, "pt-BR": administrationPtBR },
  checkout: { en: checkoutEn, "pt-BR": checkoutPtBR },
  checkoutPolicy: { en: checkoutPolicyEn, "pt-BR": checkoutPolicyPtBR },
  designSystem: { en: designSystemEn, "pt-BR": designSystemPtBR },
  dataDirectory: { en: dataDirectoryEn, "pt-BR": dataDirectoryPtBR },
  nautt: { en: nauttEn, "pt-BR": nauttPtBR },
  orders: { en: ordersEn, "pt-BR": ordersPtBR },
  paymentLinks: { en: paymentLinksEn, "pt-BR": paymentLinksPtBR },
  products: { en: productsEn, "pt-BR": productsPtBR },
  shared: { en: sharedEn, "pt-BR": sharedPtBR },
  storefront: { en: storefrontEn, "pt-BR": storefrontPtBR },
} as const;
