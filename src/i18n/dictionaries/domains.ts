import { administrationEn } from "./administration/en";
import { administrationPtBR } from "./administration/pt-BR";
import { adminDashboardEn } from "./admin-dashboard/en";
import { adminDashboardPtBR } from "./admin-dashboard/pt-BR";
import { adminUsersDirectoryEn } from "./admin-users-directory/en";
import { adminUsersDirectoryPtBR } from "./admin-users-directory/pt-BR";
import { adminUserProfileEn } from "./admin-user-profile/en";
import { adminUserProfilePtBR } from "./admin-user-profile/pt-BR";
import { appShellEn } from "./app-shell/en";
import { appShellPtBR } from "./app-shell/pt-BR";
import { checkoutEn } from "./checkout/en";
import { checkoutPtBR } from "./checkout/pt-BR";
import { checkoutPolicyEn } from "./checkout-policy/en";
import { checkoutPolicyPtBR } from "./checkout-policy/pt-BR";
import { designSystemEn } from "./design-system/en";
import { designSystemPtBR } from "./design-system/pt-BR";
import { dataDirectoryEn } from "./data-directory/en";
import { dataDirectoryPtBR } from "./data-directory/pt-BR";
import { merchantDashboardEn } from "./merchant-dashboard/en";
import { merchantDashboardPtBR } from "./merchant-dashboard/pt-BR";
import { nauttEn } from "./nautt/en";
import { nauttPtBR } from "./nautt/pt-BR";
import { notFoundEn } from "./not-found/en";
import { notFoundPtBR } from "./not-found/pt-BR";
import { ordersEn } from "./orders/en";
import { ordersPtBR } from "./orders/pt-BR";
import { ordersDirectoryEn } from "./orders-directory/en";
import { ordersDirectoryPtBR } from "./orders-directory/pt-BR";
import { paymentLinksEn } from "./payment-links/en";
import { paymentLinksDirectoryEn } from "./payment-links-directory/en";
import { paymentLinksDirectoryPtBR } from "./payment-links-directory/pt-BR";
import { paymentLinksPtBR } from "./payment-links/pt-BR";
import { productsEn } from "./products/en";
import { productsPtBR } from "./products/pt-BR";
import { profileEn } from "./profile/en";
import { profilePtBR } from "./profile/pt-BR";
import { passwordResetEn } from "./password-reset/en";
import { passwordResetPtBR } from "./password-reset/pt-BR";
import { settingsEn } from "./settings/en";
import { settingsPtBR } from "./settings/pt-BR";
import { sharedEn } from "./shared/en";
import { sharedPtBR } from "./shared/pt-BR";
import { storefrontEn } from "./storefront/en";
import { storefrontPtBR } from "./storefront/pt-BR";

export const dictionaryDomains = {
  appShell: { en: appShellEn, "pt-BR": appShellPtBR },
  administration: { en: administrationEn, "pt-BR": administrationPtBR },
  adminDashboard: { en: adminDashboardEn, "pt-BR": adminDashboardPtBR },
  adminUsersDirectory: { en: adminUsersDirectoryEn, "pt-BR": adminUsersDirectoryPtBR },
  adminUserProfile: { en: adminUserProfileEn, "pt-BR": adminUserProfilePtBR },
  checkout: { en: checkoutEn, "pt-BR": checkoutPtBR },
  checkoutPolicy: { en: checkoutPolicyEn, "pt-BR": checkoutPolicyPtBR },
  designSystem: { en: designSystemEn, "pt-BR": designSystemPtBR },
  dataDirectory: { en: dataDirectoryEn, "pt-BR": dataDirectoryPtBR },
  merchantDashboard: { en: merchantDashboardEn, "pt-BR": merchantDashboardPtBR },
  nautt: { en: nauttEn, "pt-BR": nauttPtBR },
  notFound: { en: notFoundEn, "pt-BR": notFoundPtBR },
  orders: { en: ordersEn, "pt-BR": ordersPtBR },
  ordersDirectory: { en: ordersDirectoryEn, "pt-BR": ordersDirectoryPtBR },
  paymentLinks: { en: paymentLinksEn, "pt-BR": paymentLinksPtBR },
  paymentLinksDirectory: { en: paymentLinksDirectoryEn, "pt-BR": paymentLinksDirectoryPtBR },
  products: { en: productsEn, "pt-BR": productsPtBR },
  profile: { en: profileEn, "pt-BR": profilePtBR },
  passwordReset: { en: passwordResetEn, "pt-BR": passwordResetPtBR },
  settings: { en: settingsEn, "pt-BR": settingsPtBR },
  shared: { en: sharedEn, "pt-BR": sharedPtBR },
  storefront: { en: storefrontEn, "pt-BR": storefrontPtBR },
} as const;
