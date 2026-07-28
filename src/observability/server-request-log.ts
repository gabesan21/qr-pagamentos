import "server-only";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?![\s\S])/;

export const serverRequestRoutes = {
  loginSubmit: "/login/submit",
  logout: "/logout",
  languagePreference: "/language-preference",
  products: "/products",
  productImages: "/products/images",
  productCategories: "/product-categories",
  paymentLinks: "/payment-links",
  paymentLink: "/payment-links/[id]",
  paymentLinksV2: "/payment-links-v2",
  paymentLinkV2: "/payment-links-v2/[id]",
  ordersV2: "/orders-v2",
  orderV2: "/orders-v2/[id]",
  checkoutPolicy: "/checkout-policy",
  storefront: "/storefront",
  storefrontLogo: "/storefront/logo",
  profileIdentity: "/profile/identity",
  profilePassword: "/profile/password",
  nauttCredentials: "/nautt-credentials",
  nauttCredentialsRegister: "/nautt-credentials/register",
  nauttCredentialsReset: "/nautt-credentials/reset",
  adminCurrencyPairs: "/admin/catalog/currency-pairs",
  adminCurrencyPair: "/admin/catalog/currency-pairs/[id]",
  adminPaymentMethods: "/admin/catalog/payment-methods",
  adminPaymentMethod: "/admin/catalog/payment-methods/[id]",
  adminExchangeCurrencies: "/admin/exchange-currencies",
  adminPaymentSettings: "/admin/payment-settings",
  adminUsers: "/admin/users",
  adminUserPassword: "/admin/users/[id]/password",
  adminUserResetPassword: "/admin/users/[id]/reset-password",
  adminUserRole: "/admin/users/[id]/role",
  adminUserStatus: "/admin/users/[id]/status",
  adminUserDelete: "/admin/users/[id]/delete",
  adminUserNauttCredentials: "/admin/users/[id]/nautt-credentials",
  adminSettingsDefaultTheme: "/admin/settings/default-theme",
  adminUserIdentity: "/admin/users/[id]/identity",
  adminUserLocale: "/admin/users/[id]/locale",
  adminUserCheckoutPolicy: "/admin/users/[id]/checkout-policy",
  adminUserStorefront: "/admin/users/[id]/storefront",
  publicPaymentLink: "/api/payment-links/[identifier]",
  publicCheckout: "/api/payment-links/[identifier]/checkout",
  publicCheckoutStatus: "/api/payment-links/[identifier]/checkout/status",
  standaloneCheckout: "/api/store/[slug]/checkout",
  standaloneCheckoutStatus: "/api/store/[slug]/checkout/status",
  storefrontCartCheckout: "/api/store/[slug]/cart/checkout",
  nauttWebhook: "/api/nautt/webhooks",
} as const;

type ServerRequestRoute = (typeof serverRequestRoutes)[keyof typeof serverRequestRoutes];
type ServerRequestMethod = "GET" | "POST";
type RequestCompletionOutcome = "completed" | "failed";

type RequestCompletionRecord = Readonly<{
  timestamp: string;
  level: "info" | "error";
  event: "request.completed";
  requestId: string;
  method: ServerRequestMethod;
  route: ServerRequestRoute;
  status: number;
  outcome: RequestCompletionOutcome;
  durationMs: number;
}>;

type ServerRequestMetadata = Readonly<{
  method: ServerRequestMethod;
  route: ServerRequestRoute;
}>;

export function normalizeRequestId(value: string | null): string {
  return value !== null && REQUEST_ID_PATTERN.test(value) ? value : crypto.randomUUID();
}

export async function withServerRequestLog(
  inboundRequestId: string | null,
  metadata: ServerRequestMetadata,
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  const requestId = normalizeRequestId(inboundRequestId);
  const startedAt = Date.now();

  try {
    const response = await handler();
    response.headers.set("X-Request-Id", requestId);
    writeCompletion({
      ...completionMetadata(metadata, requestId, startedAt),
      level: "info",
      status: response.status,
      outcome: "completed",
    });
    return response;
  } catch (error) {
    writeCompletion({
      ...completionMetadata(metadata, requestId, startedAt),
      level: "error",
      status: 500,
      outcome: "failed",
    });
    throw error;
  }
}

function completionMetadata(
  metadata: ServerRequestMetadata,
  requestId: string,
  startedAt: number,
): Pick<RequestCompletionRecord, "timestamp" | "event" | "requestId" | "method" | "route" | "durationMs"> {
  return {
    timestamp: new Date().toISOString(),
    event: "request.completed",
    requestId,
    method: metadata.method,
    route: metadata.route,
    durationMs: Math.max(0, Math.round(Date.now() - startedAt)),
  };
}

function writeCompletion(record: RequestCompletionRecord) {
  try {
    console.info(JSON.stringify(record));
  } catch {
    // Logging cannot alter an HTTP response or replace a handler failure.
  }
}
