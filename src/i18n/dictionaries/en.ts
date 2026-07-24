import { sharedEn } from "./shared/en";
import { nauttEn } from "./nautt/en";
import { designSystemEn } from "./design-system/en";
import { administrationEn } from "./administration/en";
import { productsEn } from "./products/en";
import { paymentLinksEn } from "./payment-links/en";
import { checkoutPolicyEn } from "./checkout-policy/en";
import { storefrontEn } from "./storefront/en";
import { checkoutEn } from "./checkout/en";
import { ordersEn } from "./orders/en";

export const en = {
  ...sharedEn,
  ...nauttEn,
  ...designSystemEn,
  ...administrationEn,
  ...productsEn,
  ...paymentLinksEn,
  ...checkoutPolicyEn,
  ...storefrontEn,
  ...checkoutEn,
  ...ordersEn,
} as const;
