import { sharedPtBR } from "./shared/pt-BR";
import { settingsPtBR } from "./settings/pt-BR";
import { nauttPtBR } from "./nautt/pt-BR";
import { designSystemPtBR } from "./design-system/pt-BR";
import { administrationPtBR } from "./administration/pt-BR";
import { productsPtBR } from "./products/pt-BR";
import { paymentLinksPtBR } from "./payment-links/pt-BR";
import { paymentLinksDirectoryPtBR } from "./payment-links-directory/pt-BR";
import { checkoutPolicyPtBR } from "./checkout-policy/pt-BR";
import { storefrontPtBR } from "./storefront/pt-BR";
import { checkoutPtBR } from "./checkout/pt-BR";
import { ordersPtBR } from "./orders/pt-BR";
import { ordersDirectoryPtBR } from "./orders-directory/pt-BR";
import { dataDirectoryPtBR } from "./data-directory/pt-BR";
import { appShellPtBR } from "./app-shell/pt-BR";
import { profilePtBR } from "./profile/pt-BR";
import { passwordResetPtBR } from "./password-reset/pt-BR";
import { merchantDashboardPtBR } from "./merchant-dashboard/pt-BR";
import { adminDashboardPtBR } from "./admin-dashboard/pt-BR";
import { adminUsersDirectoryPtBR } from "./admin-users-directory/pt-BR";
import { adminUserProfilePtBR } from "./admin-user-profile/pt-BR";

export const ptBR = {
  ...appShellPtBR,
  ...profilePtBR,
  ...passwordResetPtBR,
  ...settingsPtBR,
  ...merchantDashboardPtBR,
  ...adminDashboardPtBR,
  ...adminUsersDirectoryPtBR,
  ...adminUserProfilePtBR,
  ...sharedPtBR,
  ...nauttPtBR,
  ...designSystemPtBR,
  ...dataDirectoryPtBR,
  ...administrationPtBR,
  ...productsPtBR,
  ...paymentLinksPtBR,
  ...paymentLinksDirectoryPtBR,
  ...checkoutPolicyPtBR,
  ...storefrontPtBR,
  ...checkoutPtBR,
  ...ordersPtBR,
  ...ordersDirectoryPtBR,
} as const;
