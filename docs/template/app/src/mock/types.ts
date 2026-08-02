import type { ThemeId } from "@/theme/ThemeProvider";
import type { Locale } from "@/i18n";

export type Role = "ADMIN" | "USER";

export type AccountState = "active" | "disabled" | "deleted";

export interface LocalizedText {
  "pt-BR": string;
  en: string;
}

export type CheckoutDataPolicy = "none" | "nameEmail" | "cpf" | "fullAddress";

export interface StorefrontConfig {
  enabled: boolean;
  slug: string | null;
  displayName: LocalizedText;
  theme: ThemeId;
  layout: "boxed" | "table";
  /** Storefront accent hex value (e.g. "#00B8A0"). */
  accent: string;
  logoUrl: string | null;
  standalonePayments: boolean;
  /** Explicitly clearable default currency (null = none assigned). */
  defaultCurrency: string | null;
  /** Required buyer data on the public checkout. */
  checkoutPolicy: CheckoutDataPolicy;
}

/** Merchant's own Nautt API connection (secret is never stored in fixtures). */
export interface NauttConnection {
  status: "connected" | "invalid" | "not-configured";
  lastValidatedAt: string | null;
}

/** Supported currency mapping available to a merchant. */
export interface CurrencyMapping {
  code: string;
  active: boolean;
}

export interface MerchantSettings {
  merchantId: string;
  nautt: NauttConnection;
  supportedCurrencies: CurrencyMapping[];
}

export interface User {
  id: string;
  username: string;
  email: string | null;
  role: Role;
  state: AccountState;
  locale: Locale;
  totpEnabled: boolean;
  storefront: StorefrontConfig;
  createdAt: string;
  lastActivityAt: string;
}

/** Admin-facing order origin classification (design: LINK / STANDALONE / AD_HOC). */
export type OrderOrigin = "LINK" | "STANDALONE" | "AD_HOC";

export type ProviderState =
  | "created"
  | "pending"
  | "indeterminate"
  | "confirmed"
  | "rejected"
  | "cancelled"
  | "expired"
  | "refunded";

export type LocalOutcome = "finalized" | "in-progress" | "none";

export interface Money {
  amount: number; // major units, exact decimal (2 places)
  currency: "BRL";
}

export interface PayerSummary {
  name: string | null;
  document: string | null;
  email: string | null;
  address?: string | null;
}

export interface OrderComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

/** Commerce V1 fixed-amount order. */
export interface OrderV1 {
  kind: "v1";
  id: string;
  merchantId: string;
  merchantUsername: string;
  source: "v1";
  origin: OrderOrigin;
  amount: Money;
  /** PIX receipt/end-to-end reference exposed to the merchant; provider internals are never stored here. */
  paymentRef: string | null;
  providerState: ProviderState;
  localOutcome: LocalOutcome;
  payer: PayerSummary;
  qrPayload: string;
  comments: OrderComment[];
  createdAt: string;
  updatedAt: string;
}

/** Commerce V2 order tied to a payment link. */
export interface OrderV2 {
  kind: "v2";
  id: string;
  merchantId: string;
  merchantUsername: string;
  source: "v2";
  origin: OrderOrigin;
  paymentLinkId: string;
  paymentLinkIdentifier: string;
  items: Array<{ productId: string; title: LocalizedText; quantity: number; unitPrice: Money }>;
  total: Money;
  providerState: ProviderState;
  localOutcome: LocalOutcome;
  /** PIX receipt/end-to-end reference exposed to the merchant; provider internals are never stored here. */
  paymentRef: string | null;
  customer: PayerSummary;
  qrPayload: string;
  comments: OrderComment[];
  createdAt: string;
  updatedAt: string;
}

export type Order = OrderV1 | OrderV2;

export type LinkLifecycle = "active" | "paid" | "expired" | "inactive";

export interface PaymentLinkLine {
  productId: string;
  quantity: number;
}

export interface PaymentLinkV2 {
  id: string;
  identifier: string; // public slug used in /pay/[identifier]
  merchantId: string;
  merchantUsername: string;
  type: "reusable" | "single-use";
  composition: "fixed" | "products";
  lifecycle: LinkLifecycle;
  title: LocalizedText;
  description: LocalizedText;
  fixedAmount: Money | null;
  productIds: string[];
  /** Product lines with per-product quantity (mirrors productIds when present). */
  productLines?: PaymentLinkLine[];
  orderCount: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Retained legacy (pre-V2) payment link — read-only in the merchant directory. */
export interface LegacyLink {
  id: string;
  identifier: string;
  merchantId: string;
  merchantUsername: string;
  title: LocalizedText;
  amount: Money;
  state: "active" | "inactive" | "paid";
  createdAt: string;
  expiresAt: string | null;
}

/** Retained V1 payment link: single product, fixed price. */
export interface PaymentLinkV1 {
  id: string;
  identifier: string; // public slug used in /pay/[identifier]
  merchantId: string;
  merchantUsername: string;
  lifecycle: LinkLifecycle;
  title: LocalizedText;
  description: LocalizedText;
  price: Money;
  expiresAt: string | null;
  createdAt: string;
}

export interface Product {
  id: string;
  merchantId: string;
  /** Unique-per-merchant internal name (not localized). */
  internalName: string;
  title: LocalizedText;
  description: LocalizedText;
  price: Money;
  categoryId: string | null;
  imageUrl: string | null;
  state: "active" | "inactive" | "archived";
  createdAt: string;
}

export interface Category {
  id: string;
  merchantId: string;
  name: LocalizedText;
  state: "active" | "inactive" | "archived";
  createdAt: string;
}

export interface PlatformSettings {
  platformDefaultTheme: ThemeId;
  defaultLocale: Locale;
  checkoutPolicy: {
    collectName: boolean;
    collectDocument: boolean;
    collectEmail: boolean;
  };
  pixProvider: { name: string; sandbox: boolean };
  resetTokenTtlMinutes: number;
  totpIssuer: string;
}

export interface DashboardStats {
  period: "today" | "7d" | "30d";
  users: { total: number; active: number; deleted: number };
  orders: { created: number; bySource: Record<"v1" | "v2", number>; byProviderState: Record<ProviderState, number> };
  sales: { providerConfirmed: Money; locallyFinalized: Money };
  funnel: { converted: number; abandoned: number; inProgress: number };
  links: { total: number; active: number };
  products: { active: number; archived: number };
  /** Admin dashboard extras (optional so merchant dashboards can ignore them). */
  ordersByOrigin?: Record<OrderOrigin, number>;
  topMerchants?: Array<{ userId: string; username: string; deleted: boolean; confirmedOrders: number }>;
  topProducts?: Array<{ productId: string; title: LocalizedText; quantity: number; revenue: Money }>;
}

/** Admin: public currency-code mapping to Nautt currency + exchange-currency UUIDs. */
export interface ExchangeCurrencyMapping {
  id: string;
  code: string; // e.g. "BRL"
  nauttCurrencyId: string;
  nauttExchangeCurrencyId: string;
  status: "active" | "inactive";
  /** Where the mapping is referenced (blocks deactivation when non-empty). */
  inUseBy: string[];
}

/** Admin: Nautt currency-pair record, e.g. "BRL / PIX". */
export interface CurrencyPairRecord {
  id: string;
  name: string;
  status: "active" | "inactive";
  createdAt: string;
  inUseBy: string[];
}

/** Admin: Nautt payment-method record, e.g. "PIX". */
export interface PaymentMethodRecord {
  id: string;
  name: string;
  status: "active" | "inactive";
  createdAt: string;
  inUseBy: string[];
}

/** Admin: globally supported currencies/methods actually used by the app. */
export interface GlobalPaymentToggle {
  id: string;
  name: string; // e.g. "BRL", "PIX"
  kind: "currency" | "method";
  primary?: boolean; // BRL / PIX pinned first
  enabled: boolean;
  /** Dependency unavailable (e.g. mapping inactive) → row disabled. */
  dependencyAvailable: boolean;
  inUse: boolean;
}

export interface AdminPlatformConfig {
  exchangeCurrencies: ExchangeCurrencyMapping[];
  currencyPairs: CurrencyPairRecord[];
  paymentMethods: PaymentMethodRecord[];
  globalPayments: GlobalPaymentToggle[];
  defaultTheme: ThemeId;
}

export type DashboardPeriod = "today" | "7d" | "30d";

export interface MerchantDashboardData {
  period: DashboardPeriod;
  ordersInPeriod: number;
  byOrigin: Record<OrderOrigin, number>;
  byProviderState: Record<ProviderState, number>;
  /** Per-currency-pair totals — never summed across pairs. */
  providerConfirmedSales: Money[];
  locallyFinalizedSales: Money[];
  conversionRate: number; // 0..1
  funnel: { converted: number; inProgress: number; abandoned: number };
  links: { active: number; total: number };
  products: { active: number; archived: number };
  leadingProducts: Array<{ product: Product; confirmedQty: number; revenue: Money }>;
  recentOrders: Order[];
  isFirstRun: boolean;
}
