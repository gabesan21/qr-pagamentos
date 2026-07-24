import { sharedPtBR } from "./shared/pt-BR";
import { nauttPtBR } from "./nautt/pt-BR";
import { designSystemPtBR } from "./design-system/pt-BR";
import { administrationPtBR } from "./administration/pt-BR";
import { productsPtBR } from "./products/pt-BR";
import { paymentLinksPtBR } from "./payment-links/pt-BR";
import { checkoutPolicyPtBR } from "./checkout-policy/pt-BR";
import { storefrontPtBR } from "./storefront/pt-BR";
import { checkoutPtBR } from "./checkout/pt-BR";
import { ordersPtBR } from "./orders/pt-BR";
import { dataDirectoryPtBR } from "./data-directory/pt-BR";
import { appShellPtBR } from "./app-shell/pt-BR";

export const ptBR = {
  ...appShellPtBR,
  ...sharedPtBR,
  ...nauttPtBR,
  ...designSystemPtBR,
  ...dataDirectoryPtBR,
  ...administrationPtBR,
  ...productsPtBR,
  ...paymentLinksPtBR,
  ...checkoutPolicyPtBR,
  ...storefrontPtBR,
  ...checkoutPtBR,
  ...ordersPtBR,
} as const;
