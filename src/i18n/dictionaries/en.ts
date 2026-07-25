import { sharedEn } from "./shared/en";
import { nauttEn } from "./nautt/en";
import { designSystemEn } from "./design-system/en";
import { administrationEn } from "./administration/en";
import { productsEn } from "./products/en";
import { paymentLinksEn } from "./payment-links/en";
import { paymentLinksDirectoryEn } from "./payment-links-directory/en";
import { checkoutPolicyEn } from "./checkout-policy/en";
import { storefrontEn } from "./storefront/en";
import { checkoutEn } from "./checkout/en";
import { ordersEn } from "./orders/en";
import { dataDirectoryEn } from "./data-directory/en";
import { appShellEn } from "./app-shell/en";
import { profileEn } from "./profile/en";
import { merchantDashboardEn } from "./merchant-dashboard/en";

export const en = {
  ...appShellEn,
  ...profileEn,
  ...merchantDashboardEn,
  ...sharedEn,
  ...nauttEn,
  ...designSystemEn,
  ...dataDirectoryEn,
  ...administrationEn,
  ...productsEn,
  ...paymentLinksEn,
  ...paymentLinksDirectoryEn,
  ...checkoutPolicyEn,
  ...storefrontEn,
  ...checkoutEn,
  ...ordersEn,
} as const;
