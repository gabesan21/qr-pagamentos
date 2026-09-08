import { sharedEn } from "./shared/en";
import { settingsEn } from "./settings/en";
import { nauttEn } from "./nautt/en";
import { notFoundEn } from "./not-found/en";
import { designSystemEn } from "./design-system/en";
import { administrationEn } from "./administration/en";
import { productsEn } from "./products/en";
import { paymentLinksEn } from "./payment-links/en";
import { paymentLinksDirectoryEn } from "./payment-links-directory/en";
import { paymentLinksFormEn } from "./payment-links-form/en";
import { checkoutPolicyEn } from "./checkout-policy/en";
import { storefrontEn } from "./storefront/en";
import { checkoutEn } from "./checkout/en";
import { ordersEn } from "./orders/en";
import { ordersDirectoryEn } from "./orders-directory/en";
import { dataDirectoryEn } from "./data-directory/en";
import { appShellEn } from "./app-shell/en";
import { profileEn } from "./profile/en";
import { passwordResetEn } from "./password-reset/en";
import { merchantDashboardEn } from "./merchant-dashboard/en";
import { adminDashboardEn } from "./admin-dashboard/en";
import { adminUsersDirectoryEn } from "./admin-users-directory/en";
import { adminUserProfileEn } from "./admin-user-profile/en";

export const en = {
  ...appShellEn,
  ...profileEn,
  ...passwordResetEn,
  ...settingsEn,
  ...merchantDashboardEn,
  ...adminDashboardEn,
  ...adminUsersDirectoryEn,
  ...adminUserProfileEn,
  ...sharedEn,
  ...nauttEn,
  ...notFoundEn,
  ...designSystemEn,
  ...dataDirectoryEn,
  ...administrationEn,
  ...productsEn,
  ...paymentLinksEn,
  ...paymentLinksDirectoryEn,
  ...paymentLinksFormEn,
  ...checkoutPolicyEn,
  ...storefrontEn,
  ...checkoutEn,
  ...ordersEn,
  ...ordersDirectoryEn,
} as const;
