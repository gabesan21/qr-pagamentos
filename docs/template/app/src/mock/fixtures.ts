import type {
  AdminPlatformConfig,
  Category,
  DashboardPeriod,
  MerchantSettings,
  CheckoutDataPolicy,
  DashboardStats,
  LocalOutcome,
  MerchantDashboardData,
  LegacyLink,
  Order,
  OrderComment,
  OrderOrigin,
  OrderV1,
  OrderV2,
  Money,
  PaymentLinkV1,
  PaymentLinkV2,
  PlatformSettings,
  Product,
  ProviderState,
  User,
} from "./types";

const now = Date.now();
const iso = (offsetMin: number) => new Date(now - offsetMin * 60_000).toISOString();

export const PIX_PAYLOAD =
  "00020126580014BR.GOV.BCB.PIX0136a1b2c3d4-e5f6-7890-abcd-ef012345678952040000530398654061234.565802BR5913Loja do Ana6009SAO PAULO62070503***6304AB12";

export const users: User[] = [
  {
    id: "u_admin",
    username: "nautt-admin",
    email: "admin@nautt.finance",
    role: "ADMIN",
    state: "active",
    locale: "pt-BR",
    totpEnabled: true,
    storefront: {
      enabled: false,
      slug: null,
      displayName: { "pt-BR": "Nautt Finance", en: "Nautt Finance" },
      theme: "vault-blue",
      layout: "table",
      accent: "#4F8DFD",
      logoUrl: null,
      standalonePayments: false,
      defaultCurrency: null,
      checkoutPolicy: "nameEmail",
    },
    createdAt: iso(60 * 24 * 400),
    lastActivityAt: iso(15),
  },
  {
    id: "u_ana",
    username: "loja-do-ana",
    email: "ana@lojadoana.com.br",
    role: "USER",
    state: "active",
    locale: "pt-BR",
    totpEnabled: false,
    storefront: {
      enabled: true,
      slug: "loja-do-ana",
      displayName: { "pt-BR": "Loja do Ana", en: "Ana's Store" },
      theme: "pix-paper",
      layout: "boxed",
      accent: "#00B8A0",
      logoUrl: null,
      standalonePayments: true,
      defaultCurrency: "BRL",
      checkoutPolicy: "nameEmail",
    },
    createdAt: iso(60 * 24 * 210),
    lastActivityAt: iso(45),
  },
  {
    id: "u_beto",
    username: "mercado-beto",
    email: null,
    role: "USER",
    state: "disabled",
    locale: "en",
    totpEnabled: false,
    storefront: {
      enabled: false,
      slug: null,
      displayName: { "pt-BR": "Mercado do Beto", en: "Beto's Market" },
      theme: "cashier-daylight",
      layout: "table",
      accent: "#2456E6",
      logoUrl: null,
      standalonePayments: false,
      defaultCurrency: null,
      checkoutPolicy: "none",
    },
    createdAt: iso(60 * 24 * 120),
    lastActivityAt: iso(60 * 24 * 30),
  },
  {
    id: "u_rafa",
    username: "cafeteria-rafa",
    email: "rafa@cafeteriarafa.com.br",
    role: "USER",
    state: "active",
    locale: "pt-BR",
    totpEnabled: false,
    storefront: {
      enabled: true,
      slug: "cafeteria-rafa",
      displayName: { "pt-BR": "Cafeteria do Rafa", en: "Rafa's Coffee House" },
      theme: "midnight-clearing",
      layout: "boxed",
      accent: "#5EEAD4",
      logoUrl: null,
      standalonePayments: true,
      defaultCurrency: "BRL",
      checkoutPolicy: "fullAddress",
    },
    createdAt: iso(60 * 24 * 160),
    lastActivityAt: iso(120),
  },
  {
    id: "u_old",
    username: "emporio-central",
    email: "contato@emporiocentral.com.br",
    role: "USER",
    state: "deleted",
    locale: "pt-BR",
    totpEnabled: false,
    storefront: {
      enabled: false,
      slug: null,
      displayName: { "pt-BR": "Empório Central", en: "Central Emporium" },
      theme: "settlement-sand",
      layout: "table",
      accent: "#A85B1E",
      logoUrl: null,
      standalonePayments: false,
      defaultCurrency: null,
      checkoutPolicy: "none",
    },
    createdAt: iso(60 * 24 * 500),
    lastActivityAt: iso(60 * 24 * 90),
  },
];

export const categories: Category[] = [
  { id: "c_bebidas", merchantId: "u_ana", name: { "pt-BR": "Bebidas", en: "Drinks" }, state: "active", createdAt: iso(60 * 24 * 100) },
  { id: "c_doces", merchantId: "u_ana", name: { "pt-BR": "Doces", en: "Sweets" }, state: "active", createdAt: iso(60 * 24 * 90) },
  { id: "c_old", merchantId: "u_ana", name: { "pt-BR": "Sazonais", en: "Seasonal" }, state: "archived", createdAt: iso(60 * 24 * 150) },
];

export const products: Product[] = [
  { id: "p_cafe", merchantId: "u_ana", internalName: "cafe-250g", title: { "pt-BR": "Café especial 250g", en: "Specialty coffee 250g" }, description: { "pt-BR": "Grãos torrados artesanalmente.", en: "Artisan roasted beans." }, price: { amount: 42.9, currency: "BRL" }, categoryId: "c_bebidas", imageUrl: null, state: "active", createdAt: iso(60 * 24 * 80) },
  { id: "p_brigadeiro", merchantId: "u_ana", internalName: "brigadeiro-gourmet", title: { "pt-BR": "Brigadeiro gourmet", en: "Gourmet brigadeiro" }, description: { "pt-BR": "Caixa com 6 unidades.", en: "Box of 6." }, price: { amount: 24.5, currency: "BRL" }, categoryId: "c_doces", imageUrl: null, state: "active", createdAt: iso(60 * 24 * 70) },
  { id: "p_kombucha", merchantId: "u_ana", internalName: "kombucha-300ml", title: { "pt-BR": "Kombucha 300ml", en: "Kombucha 300ml" }, description: { "pt-BR": "Fermentado natural.", en: "Naturally fermented." }, price: { amount: 18.0, currency: "BRL" }, categoryId: "c_bebidas", imageUrl: null, state: "active", createdAt: iso(60 * 24 * 60) },
  { id: "p_panettone", merchantId: "u_ana", internalName: "panettone-artesanal", title: { "pt-BR": "Panettone artesanal", en: "Artisan panettone" }, description: { "pt-BR": "Edição sazonal.", en: "Seasonal edition." }, price: { amount: 89.9, currency: "BRL" }, categoryId: "c_old", imageUrl: null, state: "archived", createdAt: iso(60 * 24 * 140) },
  { id: "p_beto", merchantId: "u_beto", internalName: "arroz-5kg", title: { "pt-BR": "Arroz tipo 1 5kg", en: "Rice type 1 5kg" }, description: { "pt-BR": "Pacote de 5kg.", en: "5kg pack." }, price: { amount: 27.9, currency: "BRL" }, categoryId: null, imageUrl: null, state: "active", createdAt: iso(60 * 24 * 40) },
];

/** Merchant-scoped settings that live outside the user record (Nautt connection, currency mappings). */
export const merchantSettings: MerchantSettings[] = [
  {
    merchantId: "u_ana",
    nautt: { status: "connected", lastValidatedAt: iso(60 * 3) },
    supportedCurrencies: [{ code: "BRL", active: true }],
  },
  {
    merchantId: "u_beto",
    nautt: { status: "not-configured", lastValidatedAt: null },
    supportedCurrencies: [],
  },
  {
    merchantId: "u_old",
    nautt: { status: "invalid", lastValidatedAt: iso(60 * 24 * 60) },
    supportedCurrencies: [{ code: "BRL", active: false }],
  },
];

export const paymentLinks: PaymentLinkV2[] = [
  {
    id: "lk_combo",
    identifier: "combo-cafe",
    merchantId: "u_ana",
    merchantUsername: "loja-do-ana",
    type: "reusable",
    composition: "products",
    lifecycle: "active",
    title: { "pt-BR": "Combo café + brigadeiro", en: "Coffee + brigadeiro combo" },
    description: { "pt-BR": "Combo promocional da semana.", en: "Promotional weekly combo." },
    fixedAmount: null,
    productIds: ["p_cafe", "p_brigadeiro"],
    productLines: [
      { productId: "p_cafe", quantity: 1 },
      { productId: "p_brigadeiro", quantity: 1 },
    ],
    orderCount: 12,
    expiresAt: null,
    createdAt: iso(60 * 24 * 30),
    updatedAt: iso(60 * 24 * 2),
  },
  {
    id: "lk_fixo",
    identifier: "assinatura-mensal",
    merchantId: "u_ana",
    merchantUsername: "loja-do-ana",
    type: "single-use",
    composition: "fixed",
    lifecycle: "active",
    title: { "pt-BR": "Assinatura mensal", en: "Monthly subscription" },
    description: { "pt-BR": "Clube do café — mensalidade.", en: "Coffee club — monthly fee." },
    fixedAmount: { amount: 79.9, currency: "BRL" },
    productIds: [],
    orderCount: 4,
    expiresAt: new Date(now + 60 * 24 * 20 * 60_000).toISOString(),
    createdAt: iso(60 * 24 * 25),
    updatedAt: iso(60 * 24 * 1),
  },
  {
    id: "lk_exp",
    identifier: "promo-junho",
    merchantId: "u_ana",
    merchantUsername: "loja-do-ana",
    type: "single-use",
    composition: "fixed",
    lifecycle: "expired",
    title: { "pt-BR": "Promoção de junho", en: "June promotion" },
    description: { "pt-BR": "Campanha encerrada.", en: "Closed campaign." },
    fixedAmount: { amount: 49.9, currency: "BRL" },
    productIds: [],
    orderCount: 9,
    expiresAt: iso(60 * 24 * 45),
    createdAt: iso(60 * 24 * 60),
    updatedAt: iso(60 * 24 * 45),
  },
  {
    id: "lk_pago",
    identifier: "presente-dia-maes",
    merchantId: "u_ana",
    merchantUsername: "loja-do-ana",
    type: "single-use",
    composition: "fixed",
    lifecycle: "paid",
    title: { "pt-BR": "Presente Dia das Mães", en: "Mother's Day gift" },
    description: { "pt-BR": "Link de uso único já liquidado.", en: "Settled single-use link." },
    fixedAmount: { amount: 129.9, currency: "BRL" },
    productIds: [],
    orderCount: 1,
    expiresAt: null,
    createdAt: iso(60 * 24 * 90),
    updatedAt: iso(60 * 24 * 80),
  },
  {
    id: "lk_paid",
    identifier: "kit-boas-vindas",
    merchantId: "u_ana",
    merchantUsername: "loja-do-ana",
    type: "single-use",
    composition: "fixed",
    lifecycle: "paid",
    title: { "pt-BR": "Kit boas-vindas", en: "Welcome kit" },
    description: { "pt-BR": "Kit de boas-vindas do clube.", en: "Club welcome kit." },
    fixedAmount: { amount: 59.9, currency: "BRL" },
    productIds: [],
    orderCount: 1,
    expiresAt: null,
    createdAt: iso(60 * 24 * 15),
    updatedAt: iso(60 * 24 * 3),
  },
  {
    id: "lk_lista",
    identifier: "lista-espera",
    merchantId: "u_ana",
    merchantUsername: "loja-do-ana",
    type: "reusable",
    composition: "fixed",
    lifecycle: "inactive",
    title: { "pt-BR": "Lista de espera", en: "Waiting list" },
    description: { "pt-BR": "Reserva antecipada.", en: "Early reservation." },
    fixedAmount: { amount: 25.0, currency: "BRL" },
    productIds: [],
    orderCount: 0,
    expiresAt: null,
    createdAt: iso(60 * 24 * 10),
    updatedAt: iso(60 * 24 * 5),
  },
  {
    id: "lk_inativo",
    identifier: "kit-sazonal",
    merchantId: "u_ana",
    merchantUsername: "loja-do-ana",
    type: "reusable",
    composition: "products",
    lifecycle: "inactive",
    title: { "pt-BR": "Kit sazonal", en: "Seasonal kit" },
    description: { "pt-BR": "Kit com itens de edição limitada.", en: "Kit with limited-edition items." },
    fixedAmount: null,
    productIds: ["p_panettone", "p_kombucha"],
    productLines: [
      { productId: "p_panettone", quantity: 1 },
      { productId: "p_kombucha", quantity: 2 },
    ],
    orderCount: 3,
    expiresAt: null,
    createdAt: iso(60 * 24 * 120),
    updatedAt: iso(60 * 24 * 15),
  },
  {
    id: "lk_beto",
    identifier: "caixa-surpresa",
    merchantId: "u_beto",
    merchantUsername: "mercado-beto",
    type: "reusable",
    composition: "fixed",
    lifecycle: "active",
    title: { "pt-BR": "Caixa surpresa", en: "Mystery box" },
    description: { "pt-BR": "Caixa de itens variados.", en: "Box of assorted items." },
    fixedAmount: { amount: 35.0, currency: "BRL" },
    productIds: [],
    orderCount: 2,
    expiresAt: null,
    createdAt: iso(60 * 24 * 40),
    updatedAt: iso(60 * 24 * 40),
  },
];

/** Retained legacy (pre-V2) payment links — read-only. */
export const legacyLinks: LegacyLink[] = [
  {
    id: "lg_boleto",
    identifier: "boleto-antigo",
    merchantId: "u_ana",
    merchantUsername: "loja-do-ana",
    title: { "pt-BR": "Link legado de boleto", en: "Legacy boleto link" },
    amount: { amount: 60.0, currency: "BRL" },
    state: "active",
    createdAt: iso(60 * 24 * 400),
    expiresAt: null,
  },
  {
    id: "lg_pix1",
    identifier: "pix-primeira-versao",
    merchantId: "u_ana",
    merchantUsername: "loja-do-ana",
    title: { "pt-BR": "PIX primeira versão", en: "PIX first version" },
    amount: { amount: 99.9, currency: "BRL" },
    state: "inactive",
    createdAt: iso(60 * 24 * 350),
    expiresAt: iso(60 * 24 * 100),
  },
];

/** Retained V1 payment links (legacy product checkout). */
export const paymentLinksV1: PaymentLinkV1[] = [
  {
    id: "lk1_curso",
    identifier: "curso-barista",
    merchantId: "u_rafa",
    merchantUsername: "cafeteria-rafa",
    lifecycle: "active",
    title: { "pt-BR": "Curso de barista", en: "Barista course" },
    description: { "pt-BR": "Turma presencial de 4 horas com apostila inclusa.", en: "4-hour in-person class, workbook included." },
    price: { amount: 349.9, currency: "BRL" },
    expiresAt: null,
    createdAt: iso(60 * 24 * 40),
  },
  {
    id: "lk1_sacola",
    identifier: "sacola-semana",
    merchantId: "u_beto",
    merchantUsername: "mercado-beto",
    lifecycle: "inactive",
    title: { "pt-BR": "Sacola da semana", en: "Weekly bag" },
    description: { "pt-BR": "Sacola de hortifruti.", en: "Produce bag." },
    price: { amount: 65.0, currency: "BRL" },
    expiresAt: iso(60 * 24 * 20),
    createdAt: iso(60 * 24 * 35),
  },
];

/** Merchant checkout buyer-data policies (which fields the public checkout collects). */
export const checkoutDataPolicies: Record<string, CheckoutDataPolicy> = {
  u_admin: "none",
  u_ana: "cpf",
  u_rafa: "fullAddress",
  u_beto: "nameEmail",
  u_old: "none",
};

const v1 = (partial: Partial<OrderV1> & Pick<OrderV1, "id" | "providerState">): OrderV1 => ({
  kind: "v1",
  merchantId: "u_ana",
  merchantUsername: "loja-do-ana",
  source: "v1",
  origin: "STANDALONE",
  amount: { amount: 123.45, currency: "BRL" },
  paymentRef: "E2E-PIX-ANA-0001",
  localOutcome: "none",
  payer: { name: "Carlos Souza", document: null, email: null },
  qrPayload: PIX_PAYLOAD,
  comments: [],
  createdAt: iso(90),
  updatedAt: iso(80),
  ...partial,
});

const v2 = (partial: Partial<OrderV2> & Pick<OrderV2, "id" | "providerState">): OrderV2 => ({
  kind: "v2",
  merchantId: "u_ana",
  merchantUsername: "loja-do-ana",
  source: "v2",
  origin: "LINK",
  paymentRef: "E2E-PIX-ANA-0002",
  paymentLinkId: "lk_combo",
  paymentLinkIdentifier: "combo-cafe",
  items: [
    { productId: "p_cafe", title: { "pt-BR": "Café especial 250g", en: "Specialty coffee 250g" }, quantity: 1, unitPrice: { amount: 42.9, currency: "BRL" } },
    { productId: "p_brigadeiro", title: { "pt-BR": "Brigadeiro gourmet", en: "Gourmet brigadeiro" }, quantity: 2, unitPrice: { amount: 24.5, currency: "BRL" } },
  ],
  total: { amount: 91.9, currency: "BRL" },
  localOutcome: "none",
  customer: { name: "Maria Lima", document: null, email: "maria@example.com" },
  qrPayload: PIX_PAYLOAD,
  comments: [],
  createdAt: iso(300),
  updatedAt: iso(280),
  ...partial,
});

export const orders: Order[] = [
  v1({ id: "ord_8f3k2m", providerState: "confirmed", localOutcome: "finalized", createdAt: iso(60), updatedAt: iso(55) }),
  v1({ id: "ord_2h9p1x", providerState: "pending", createdAt: iso(30), updatedAt: iso(30) }),
  v1({ id: "ord_7t4w8q", providerState: "expired", amount: { amount: 56.0, currency: "BRL" }, createdAt: iso(60 * 26), updatedAt: iso(60 * 24) }),
  v1({ id: "ord_5r6y3n", providerState: "rejected", amount: { amount: 210.0, currency: "BRL" }, merchantId: "u_beto", merchantUsername: "mercado-beto", createdAt: iso(60 * 50) }),
  v2({ id: "ord_v2_a1b2c3", providerState: "confirmed", localOutcome: "finalized" }),
  v2({ id: "ord_v2_d4e5f6", providerState: "pending", paymentLinkId: "lk_fixo", paymentLinkIdentifier: "assinatura-mensal", items: [], total: { amount: 79.9, currency: "BRL" }, createdAt: iso(20) }),
  v2({ id: "ord_v2_g7h8i9", providerState: "refunded", localOutcome: "finalized", createdAt: iso(60 * 72) }),
  v2({ id: "ord_v2_j1k2l3", providerState: "indeterminate", createdAt: iso(60 * 5), comments: [{ id: "cm1", author: "loja-do-ana", body: "Cliente confirmou por WhatsApp.", createdAt: iso(60 * 4) }] }),
  // Extended deterministic set — enough volume for pagination and period filters.
  ...([
    ["ord_x01", "confirmed", "AD_HOC", 32.5, 2],
    ["ord_x02", "confirmed", "STANDALONE", 58.0, 3],
    ["ord_x03", "pending", "AD_HOC", 15.9, 5],
    ["ord_x04", "cancelled", "STANDALONE", 99.0, 6],
    ["ord_x05", "confirmed", "AD_HOC", 44.75, 8],
    ["ord_x06", "expired", "STANDALONE", 71.2, 26],
    ["ord_x07", "confirmed", "AD_HOC", 88.9, 30],
    ["ord_x08", "rejected", "STANDALONE", 19.9, 33],
    ["ord_x09", "pending", "AD_HOC", 24.5, 49],
    ["ord_x10", "confirmed", "STANDALONE", 130.0, 55],
    ["ord_x11", "refunded", "AD_HOC", 64.0, 70],
    ["ord_x12", "indeterminate", "STANDALONE", 41.3, 95],
  ] as const).map(([id, state, origin, amount, hoursAgo], i) =>
    v1({
      id: id as string,
      providerState: state as OrderV1["providerState"],
      origin: origin as OrderV1["origin"],
      amount: { amount: amount as number, currency: "BRL" },
      paymentRef: `E2E-PIX-ANA-01${String(i).padStart(2, "0")}`,
      payer: {
        name: ["Paulo Reis", null, "Ana Beatriz", "João Melo"][i % 4],
        document: i % 3 === 0 ? "123.456.789-00" : null,
        email: i % 2 === 0 ? `cliente${i}@example.com` : null,
        address: i % 4 === 0 ? "Rua das Flores, 123 — São Paulo/SP" : null,
      },
      localOutcome: state === "confirmed" && i % 2 === 0 ? "finalized" : state === "confirmed" ? "in-progress" : "none",
      createdAt: iso((hoursAgo as number) * 60),
      updatedAt: iso((hoursAgo as number) * 60 - 5),
    }),
  ),
  ...([
    ["ord_y01", "confirmed", 6],
    ["ord_y02", "pending", 10],
    ["ord_y03", "confirmed", 26],
    ["ord_y04", "expired", 50],
    ["ord_y05", "confirmed", 74],
    ["ord_y06", "cancelled", 100],
    ["ord_y07", "confirmed", 130],
    ["ord_y08", "pending", 160],
    ["ord_y09", "confirmed", 200],
    ["ord_y10", "rejected", 240],
    ["ord_y11", "confirmed", 320],
    ["ord_y12", "confirmed", 400],
  ] as const).map(([id, state, hoursAgo], i) =>
    v2({
      id: id as string,
      providerState: state as OrderV2["providerState"],
      paymentLinkId: i % 3 === 0 ? "lk_fixo" : "lk_combo",
      paymentLinkIdentifier: i % 3 === 0 ? "assinatura-mensal" : "combo-cafe",
      paymentRef: `E2E-PIX-ANA-02${String(i).padStart(2, "0")}`,
      localOutcome: state === "confirmed" && i % 2 === 1 ? "finalized" : state === "confirmed" ? "in-progress" : "none",
      customer: {
        name: ["Marcos Vieira", "Lúcia Prado", null, "Tiago Nunes"][i % 4],
        document: null,
        email: i % 2 === 1 ? `buyer${i}@example.com` : null,
      },
      createdAt: iso((hoursAgo as number) * 60),
      updatedAt: iso((hoursAgo as number) * 60 - 8),
    }),
  ),
  // Extra lk_combo orders (pagination coverage)
  v2({ id: "ord_v2_m3n4o5", providerState: "confirmed", localOutcome: "finalized", createdAt: iso(60 * 30), updatedAt: iso(60 * 29) }),
  v2({ id: "ord_v2_p6q7r8", providerState: "pending", customer: { name: "João Pedro", document: null, email: null }, createdAt: iso(60 * 26), updatedAt: iso(60 * 26) }),
  v2({ id: "ord_v2_s9t1u2", providerState: "expired", customer: { name: null, document: null, email: null }, createdAt: iso(60 * 50), updatedAt: iso(60 * 48) }),
  v2({ id: "ord_v2_v3w4x5", providerState: "confirmed", localOutcome: "in-progress", createdAt: iso(60 * 70), updatedAt: iso(60 * 65) }),
  v2({ id: "ord_v2_y6z7a8", providerState: "cancelled", createdAt: iso(60 * 90), updatedAt: iso(60 * 88) }),
  v2({ id: "ord_v2_b9c1d2", providerState: "confirmed", localOutcome: "finalized", customer: { name: "Fernanda Reis", document: "123.456.789-00", email: "fer@example.com" }, createdAt: iso(60 * 110), updatedAt: iso(60 * 105) }),
  v2({ id: "ord_v2_e3f4g5", providerState: "created", createdAt: iso(15), updatedAt: iso(15) }),
  v2({ id: "ord_v2_h6i7j8", providerState: "rejected", createdAt: iso(60 * 130), updatedAt: iso(60 * 128) }),
  v2({ id: "ord_v2_k9l1m2", providerState: "confirmed", localOutcome: "finalized", createdAt: iso(60 * 150), updatedAt: iso(60 * 140) }),
  v2({ id: "ord_v2_n3o4p5", providerState: "pending", createdAt: iso(60 * 170), updatedAt: iso(60 * 170) }),
  // Order for the paid single-use link
  v2({ id: "ord_v2_q6r7s8", providerState: "confirmed", localOutcome: "finalized", paymentLinkId: "lk_pago", paymentLinkIdentifier: "presente-dia-maes", items: [], total: { amount: 129.9, currency: "BRL" }, customer: { name: "Paula Nunes", document: null, email: "paula@example.com" }, createdAt: iso(60 * 24 * 80), updatedAt: iso(60 * 24 * 80) }),
  // Cross-owner V2 order (fence coverage)
  v2({ id: "ord_v2_t9u1v2", providerState: "pending", merchantId: "u_beto", merchantUsername: "mercado-beto", paymentLinkId: "lk_beto", paymentLinkIdentifier: "caixa-surpresa", items: [], total: { amount: 35.0, currency: "BRL" }, createdAt: iso(60 * 20), updatedAt: iso(60 * 20) }),
];

export const platformSettings: PlatformSettings = {
  platformDefaultTheme: "pix-paper",
  defaultLocale: "pt-BR",
  checkoutPolicy: { collectName: true, collectDocument: false, collectEmail: true },
  pixProvider: { name: "Nautt PIX Sandbox", sandbox: true },
  resetTokenTtlMinutes: 60,
  totpIssuer: "QR Pagamentos",
};

export const dashboardStats: DashboardStats = {
  period: "7d",
  users: { total: users.length, active: users.filter((u) => u.state === "active").length, deleted: users.filter((u) => u.state === "deleted").length },
  orders: {
    created: orders.length,
    bySource: { v1: orders.filter((o) => o.source === "v1").length, v2: orders.filter((o) => o.source === "v2").length },
    byProviderState: {
      created: 0,
      pending: orders.filter((o) => o.providerState === "pending").length,
      indeterminate: orders.filter((o) => o.providerState === "indeterminate").length,
      confirmed: orders.filter((o) => o.providerState === "confirmed").length,
      rejected: orders.filter((o) => o.providerState === "rejected").length,
      cancelled: 0,
      expired: orders.filter((o) => o.providerState === "expired").length,
      refunded: orders.filter((o) => o.providerState === "refunded").length,
    },
  },
  sales: {
    providerConfirmed: { amount: 215.35, currency: "BRL" },
    locallyFinalized: { amount: 307.25, currency: "BRL" },
  },
  funnel: { converted: 21, abandoned: 7, inProgress: 3 },
  links: { total: paymentLinks.length, active: paymentLinks.filter((l) => l.lifecycle === "active").length },
  products: { active: products.filter((p) => p.state === "active").length, archived: products.filter((p) => p.state === "archived").length },
};

/** Simulated network latency for mock reads. */
export function mockLatency(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wrap mock data in a simulated async fetch. */
export async function mockFetch<T>(data: T, ms = 400): Promise<T> {
  await mockLatency(ms);
  return structuredClone(data);
}

/* ------------------------------------------------------------------ */
/* Admin-area fixture extensions (volume for pagination, per-period    */
/* dashboard stats, platform configuration records).                   */
/* ------------------------------------------------------------------ */

const extraUserSeeds: Array<[string, string, string | null, User["role"], User["state"], boolean, string]> = [
  ["u_kiosk", "quiosque-praia", "quiosque@praia.com.br", "USER", "active", true, "midnight-clearing"],
  ["u_doceria", "doceria-lu", "lu@doceria.com", "USER", "active", true, "pix-paper"],
  ["u_atacado", "atacado-sul", null, "USER", "active", false, "cashier-daylight"],
  ["u_petshop", "petshop-rio", "oi@petshoprio.com.br", "USER", "active", true, "settlement-sand"],
  ["u_bike", "bicicletaria-andes", "contato@andes.bike", "USER", "active", false, "vault-blue"],
  ["u_farmacia", "farmacia-vida", "vida@farmacia.com.br", "USER", "disabled", false, "cashier-daylight"],
  ["u_livros", "livraria-paginas", null, "USER", "active", true, "terminal-amber"],
  ["u_admin2", "ops-admin", "ops@nautt.finance", "ADMIN", "active", true, "vault-blue"],
  ["u_pastel", "pastel-do-carlos", "carlos@pastel.com.br", "USER", "active", false, "pix-paper"],
  ["u_moda", "moda-rua", "moda@rua.com", "USER", "active", true, "midnight-clearing"],
  ["u_horti", "hortifruti-verde", null, "USER", "disabled", false, "settlement-sand"],
  ["u_gone2", "padaria-antiga", "padaria@antiga.com.br", "USER", "deleted", false, "cashier-daylight"],
  ["u_tattoo", "estudio-tinta", "tinta@estudio.art", "USER", "active", true, "terminal-amber"],
  ["u_acai", "acai-da-lagoa", null, "USER", "active", false, "pix-paper"],
];

export const extraUsers: User[] = extraUserSeeds.map(([id, username, email, role, state, storefrontOn, theme], i) => ({
  id,
  username,
  email,
  role,
  state,
  locale: i % 3 === 0 ? "en" : "pt-BR",
  totpEnabled: role === "ADMIN" || i % 5 === 0,
  storefront: {
    enabled: storefrontOn,
    slug: storefrontOn ? username : null,
    displayName: { "pt-BR": username, en: username },
    theme: theme as User["storefront"]["theme"],
    layout: i % 2 === 0 ? "table" : "boxed",
    accent: "#00B8A0",
    logoUrl: null,
    standalonePayments: i % 2 === 0,
    defaultCurrency: "BRL",
    checkoutPolicy: "none",
  },
  createdAt: iso(60 * 24 * (400 - i * 22)),
  lastActivityAt: iso(60 * (i * 7 + 3)),
}));

users.push(...extraUsers);

const extraLinkSeeds: Array<[string, string, string, PaymentLinkV2["type"], PaymentLinkV2["composition"], PaymentLinkV2["lifecycle"], number | null, number]> = [
  ["lk_k1", "coconut-water", "u_kiosk", "reusable", "fixed", "active", 15.0, 31],
  ["lk_k2", "kit-praia", "u_kiosk", "reusable", "products", "active", null, 7],
  ["lk_d1", "caixa-doces", "u_doceria", "reusable", "products", "active", null, 18],
  ["lk_a1", "atacado-mensal", "u_atacado", "single-use", "fixed", "paid", 1250.0, 1],
  ["lk_p1", "banho-tosa", "u_petshop", "reusable", "fixed", "active", 89.9, 22],
  ["lk_b1", "bike-fit", "u_bike", "single-use", "fixed", "expired", 199.0, 3],
  ["lk_l1", "clube-do-livro", "u_livros", "reusable", "fixed", "active", 39.9, 14],
  ["lk_pa1", "pastel-combo", "u_pastel", "reusable", "products", "active", null, 27],
  ["lk_m1", "look-semana", "u_moda", "reusable", "products", "inactive", null, 5],
  ["lk_t1", "flash-tattoo", "u_tattoo", "single-use", "fixed", "active", 350.0, 6],
  ["lk_ac1", "acai-500", "u_acai", "reusable", "fixed", "active", 22.0, 41],
  ["lk_old1", "cafe-vantagens", "u_old", "reusable", "fixed", "expired", 30.0, 12],
];

export const extraPaymentLinks: PaymentLinkV2[] = extraLinkSeeds.map(
  ([id, identifier, merchantId, type, composition, lifecycle, fixed, orderCount], i) => {
    const merchant = users.find((u) => u.id === merchantId)!;
    return {
      id,
      identifier,
      merchantId,
      merchantUsername: merchant.username,
      type,
      composition,
      lifecycle,
      title: { "pt-BR": `Link ${identifier}`, en: `${identifier} link` },
      description: { "pt-BR": "", en: "" },
      fixedAmount: fixed !== null ? { amount: fixed, currency: "BRL" as const } : null,
      productIds: composition === "products" ? ["p_cafe"] : [],
      orderCount,
      expiresAt: lifecycle === "expired" ? iso(60 * 24 * 10) : i % 4 === 0 ? new Date(now + 60 * 24 * 15 * 60_000).toISOString() : null,
      createdAt: iso(60 * 24 * (90 - i * 5)),
      updatedAt: iso(60 * 24 * i),
    };
  },
);

paymentLinks.push(...extraPaymentLinks);

const originStates: Array<[ProviderState, number]> = [
  ["confirmed", 14],
  ["pending", 7],
  ["created", 3],
  ["indeterminate", 2],
  ["rejected", 3],
  ["cancelled", 2],
  ["expired", 4],
  ["refunded", 2],
];

const merchantIds = ["u_ana", "u_kiosk", "u_doceria", "u_atacado", "u_petshop", "u_beto", "u_bike", "u_livros", "u_pastel", "u_moda", "u_tattoo", "u_acai", "u_old"];
const payerNames = ["Ana Paula", "João Pedro", "Mariana Costa", "Luiz Felipe", "Camila Rocha", "Rafael Dias", "Bianca Nunes", "Tiago Melo"];

const extraOrders: Order[] = [];
let seq = 0;
for (const [state, count] of originStates) {
  for (let k = 0; k < count; k++) {
    seq++;
    const merchantId = merchantIds[seq % merchantIds.length]!;
    const merchant = users.find((u) => u.id === merchantId)!;
    const isV2 = seq % 3 !== 0;
    const minutesAgo = 60 * (seq * 13 + 7);
    const payer = { name: seq % 4 === 0 ? null : payerNames[seq % payerNames.length]!, document: null, email: seq % 5 === 0 ? `cliente${seq}@mail.com` : null };
    if (isV2) {
      const link = paymentLinks.filter((l) => l.merchantId === merchantId)[0] ?? paymentLinks[seq % paymentLinks.length]!;
      extraOrders.push(
        v2({
          id: `ord_g_${String(seq).padStart(4, "0")}`,
          merchantId: link.merchantId,
          merchantUsername: link.merchantUsername,
          paymentLinkId: link.id,
          paymentLinkIdentifier: link.identifier,
          providerState: state,
          localOutcome: state === "confirmed" && seq % 2 === 0 ? "finalized" : seq % 6 === 0 ? "in-progress" : "none",
          total: { amount: Math.round(((seq * 37.5) % 900 + 12) * 100) / 100, currency: "BRL" },
          customer: payer,
          items:
            link.composition === "products"
              ? [{ productId: "p_cafe", title: { "pt-BR": "Item do link", en: "Link item" }, quantity: (seq % 3) + 1, unitPrice: { amount: Math.round(((seq * 12.9) % 200 + 5) * 100) / 100, currency: "BRL" } }]
              : [],
          createdAt: iso(minutesAgo),
          updatedAt: iso(minutesAgo - 5),
        }),
      );
    } else {
      extraOrders.push(
        v1({
          id: `ord_s_${String(seq).padStart(4, "0")}`,
          merchantId,
          merchantUsername: merchant.username,
          origin: seq % 2 === 0 ? "AD_HOC" : "STANDALONE",
          providerState: state,
          localOutcome: state === "confirmed" && seq % 3 === 0 ? "finalized" : "none",
          amount: { amount: Math.round(((seq * 53.7) % 1200 + 9.9) * 100) / 100, currency: "BRL" },
          payer,
          createdAt: iso(minutesAgo),
          updatedAt: iso(minutesAgo - 3),
        }),
      );
    }
  }
}

orders.push(...extraOrders);

/* ----------------------- Admin dashboard stats ---------------------- */

function statsFor(period: DashboardStats["period"]): DashboardStats {
  const within = (isoDate: string, days: number) => now - new Date(isoDate).getTime() <= days * 24 * 60 * 60_000;
  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
  const scoped = orders.filter((o) => within(o.createdAt, days));
  const byProviderState = scoped.reduce<Record<ProviderState, number>>(
    (acc, o) => ({ ...acc, [o.providerState]: (acc[o.providerState] ?? 0) + 1 }),
    { created: 0, pending: 0, indeterminate: 0, confirmed: 0, rejected: 0, cancelled: 0, expired: 0, refunded: 0 },
  );
  const originOf = (o: Order): OrderOrigin => (o.kind === "v2" ? "LINK" : o.origin ?? "STANDALONE");
  const byOrigin: Record<OrderOrigin, number> = { LINK: 0, STANDALONE: 0, AD_HOC: 0 };
  for (const o of scoped) byOrigin[originOf(o)]++;
  const sum = (list: Order[]) => Math.round(list.reduce((s, o) => s + (o.kind === "v1" ? o.amount.amount : o.total.amount), 0) * 100) / 100;
  const confirmed = scoped.filter((o) => o.providerState === "confirmed");
  const finalized = scoped.filter((o) => o.localOutcome === "finalized");
  const confirmedByMerchant = new Map<string, number>();
  for (const o of confirmed) confirmedByMerchant.set(o.merchantId, (confirmedByMerchant.get(o.merchantId) ?? 0) + 1);
  const topMerchants = [...confirmedByMerchant.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([userId, confirmedOrders]) => {
      const u = users.find((x) => x.id === userId)!;
      return { userId, username: u.username, deleted: u.state === "deleted", confirmedOrders };
    });
  const productQty = new Map<string, { qty: number; revenue: number; title: { "pt-BR": string; en: string } }>();
  for (const o of confirmed) {
    if (o.kind !== "v2") continue;
    for (const it of o.items) {
      const cur = productQty.get(it.productId) ?? { qty: 0, revenue: 0, title: it.title };
      cur.qty += it.quantity;
      cur.revenue += it.quantity * it.unitPrice.amount;
      productQty.set(it.productId, cur);
    }
  }
  const topProducts = [...productQty.entries()]
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 5)
    .map(([productId, v]) => ({ productId, title: v.title, quantity: v.qty, revenue: { amount: Math.round(v.revenue * 100) / 100, currency: "BRL" as const } }));
  return {
    period,
    users: {
      total: users.length,
      active: users.filter((u) => u.state === "active").length,
      deleted: users.filter((u) => u.state === "deleted").length,
    },
    orders: { created: scoped.length, bySource: { v1: scoped.filter((o) => o.source === "v1").length, v2: scoped.filter((o) => o.source === "v2").length }, byProviderState },
    ordersByOrigin: byOrigin,
    sales: {
      providerConfirmed: { amount: sum(confirmed), currency: "BRL" },
      locallyFinalized: { amount: sum(finalized), currency: "BRL" },
    },
    funnel: {
      converted: confirmed.length,
      inProgress: scoped.filter((o) => ["created", "pending", "indeterminate"].includes(o.providerState)).length,
      abandoned: scoped.filter((o) => ["expired", "cancelled", "rejected"].includes(o.providerState)).length,
    },
    links: { total: paymentLinks.length, active: paymentLinks.filter((l) => l.lifecycle === "active").length },
    products: { active: products.filter((p) => p.state === "active").length, archived: products.filter((p) => p.state === "archived").length },
    topMerchants,
    topProducts,
  };
}

export const dashboardStatsByPeriod: Record<DashboardStats["period"], DashboardStats> = {
  today: statsFor("today"),
  "7d": statsFor("7d"),
  "30d": statsFor("30d"),
};

/* --------------------- Admin platform configuration ------------------ */

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const adminPlatformConfig: AdminPlatformConfig = {
  exchangeCurrencies: [
    { id: "ec_brl", code: "BRL", nauttCurrencyId: uuid(101), nauttExchangeCurrencyId: uuid(201), status: "active", inUseBy: ["BRL / PIX", "settings.globalPayments"] },
    { id: "ec_usd", code: "USD", nauttCurrencyId: uuid(102), nauttExchangeCurrencyId: uuid(202), status: "inactive", inUseBy: [] },
  ],
  currencyPairs: [
    { id: "cp_brl_pix", name: "BRL / PIX", status: "active", createdAt: iso(60 * 24 * 400), inUseBy: ["links", "orders", "storefronts"] },
    { id: "cp_usd_card", name: "USD / CARD", status: "inactive", createdAt: iso(60 * 24 * 120), inUseBy: [] },
  ],
  paymentMethods: [
    { id: "pm_pix", name: "PIX", status: "active", createdAt: iso(60 * 24 * 400), inUseBy: ["BRL / PIX"] },
    { id: "pm_card", name: "CARD", status: "inactive", createdAt: iso(60 * 24 * 120), inUseBy: [] },
  ],
  globalPayments: [
    { id: "gp_brl", name: "BRL", kind: "currency", primary: true, enabled: true, dependencyAvailable: true, inUse: true },
    { id: "gp_pix", name: "PIX", kind: "method", primary: true, enabled: true, dependencyAvailable: true, inUse: true },
    { id: "gp_usd", name: "USD", kind: "currency", enabled: false, dependencyAvailable: false, inUse: false },
    { id: "gp_card", name: "CARD", kind: "method", enabled: false, dependencyAvailable: false, inUse: false },
  ],
  defaultTheme: platformSettings.platformDefaultTheme,
};
/* -------------------------------------------------------------------------- */
/* Merchant-scoped mock API                                                    */
/* -------------------------------------------------------------------------- */

const PERIOD_MINUTES: Record<DashboardPeriod, number> = {
  today: 60 * 24, // same calendar window approximation for the mock
  "7d": 60 * 24 * 7,
  "30d": 60 * 24 * 30,
};

function sumByCurrency(list: Money[]): Money[] {
  const map = new Map<string, number>();
  for (const m of list) map.set(m.currency, (map.get(m.currency) ?? 0) + m.amount);
  return [...map.entries()].map(([currency, amount]) => ({
    currency: currency as Money["currency"],
    // keep exact 2-decimal precision
    amount: Math.round(amount * 100) / 100,
  }));
}

function merchantOrders(userId: string): Order[] {
  return orders.filter((o) => o.merchantId === userId);
}

/** Owner-scoped dashboard aggregation, recomputed per period. */
export async function fetchMerchantDashboard(userId: string, period: DashboardPeriod): Promise<MerchantDashboardData> {
  await mockLatency(450);
  const mine = merchantOrders(userId);
  const cutoff = now - PERIOD_MINUTES[period] * 60_000;
  const inPeriod = mine.filter((o) => new Date(o.createdAt).getTime() >= cutoff);

  const byOrigin: Record<OrderOrigin, number> = { LINK: 0, STANDALONE: 0, AD_HOC: 0 };
  const byProviderState: Record<ProviderState, number> = {
    created: 0, pending: 0, indeterminate: 0, confirmed: 0, rejected: 0, cancelled: 0, expired: 0, refunded: 0,
  };
  for (const o of inPeriod) {
    byOrigin[o.origin] += 1;
    byProviderState[o.providerState] += 1;
  }

  // Provider-confirmed sales and locally-finalized sales are SEPARATE groups — never merged.
  const confirmed = inPeriod.filter((o) => o.providerState === "confirmed");
  const finalized = inPeriod.filter((o) => o.localOutcome === "finalized");
  const providerConfirmedSales = sumByCurrency(confirmed.map((o) => (o.kind === "v1" ? o.amount : o.total)));
  const locallyFinalizedSales = sumByCurrency(finalized.map((o) => (o.kind === "v1" ? o.amount : o.total)));

  // Deterministic mock funnel scaled to the period.
  const seed = period === "today" ? 4 : period === "7d" ? 18 : 42;
  const converted = Math.max(confirmed.length, Math.round(seed * 0.6));
  const inProgress = inPeriod.filter((o) => o.providerState === "pending" || o.providerState === "created").length + 1;
  const abandoned = inPeriod.filter((o) => ["expired", "cancelled", "rejected"].includes(o.providerState)).length + Math.round(seed * 0.2);
  const funnelTotal = converted + inProgress + abandoned;
  const conversionRate = funnelTotal === 0 ? 0 : converted / funnelTotal;

  const myLinks = paymentLinks.filter((l) => l.merchantId === userId);
  const myProducts = products.filter((p) => p.merchantId === userId);

  // Leading products: confirmed-quantity and revenue from confirmed V2 line items in period.
  const qty = new Map<string, { qty: number; revenue: number }>();
  for (const o of confirmed) {
    if (o.kind !== "v2") continue;
    for (const item of o.items) {
      const cur = qty.get(item.productId) ?? { qty: 0, revenue: 0 };
      cur.qty += item.quantity;
      cur.revenue += item.quantity * item.unitPrice.amount;
      qty.set(item.productId, cur);
    }
  }
  const leadingProducts = [...qty.entries()]
    .map(([productId, v]) => {
      const product = myProducts.find((p) => p.id === productId);
      return product
        ? { product, confirmedQty: v.qty, revenue: { amount: Math.round(v.revenue * 100) / 100, currency: "BRL" as const } }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.revenue.amount - a.revenue.amount)
    .slice(0, 5);

  const recentOrders = [...mine].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 5);

  const result: MerchantDashboardData = {
    period,
    ordersInPeriod: inPeriod.length,
    byOrigin,
    byProviderState,
    providerConfirmedSales,
    locallyFinalizedSales,
    conversionRate,
    funnel: { converted, inProgress, abandoned },
    links: { active: myLinks.filter((l) => l.lifecycle === "active").length, total: myLinks.length },
    products: { active: myProducts.filter((p) => p.state === "active").length, archived: myProducts.filter((p) => p.state === "archived").length },
    leadingProducts,
    recentOrders: structuredClone(recentOrders),
    isFirstRun: mine.length === 0,
  };
  return result;
}

/** Owner-scoped orders list. */
export async function fetchMerchantOrders(userId: string): Promise<Order[]> {
  await mockLatency(450);
  return structuredClone(
    merchantOrders(userId).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
  );
}

/**
 * Owner-authorized order lookup. Unknown, cross-owner, or unavailable ids all
 * resolve to `null` — one identical safe state, no reason leakage.
 */
export async function fetchMerchantOrder(userId: string, id: string, kind: "v1" | "v2"): Promise<Order | null> {
  await mockLatency(400);
  const found = orders.find((o) => o.id === id && o.kind === kind && o.merchantId === userId);
  return found ? structuredClone(found) : null;
}

let commentSeq = 100;

/** Append a merchant comment to an owned order (mock write). */
export async function addMerchantOrderComment(
  userId: string,
  orderId: string,
  body: string,
): Promise<OrderComment | null> {
  await mockLatency(500);
  const order = orders.find((o) => o.id === orderId && o.merchantId === userId);
  if (!order) return null;
  const comment: OrderComment = {
    id: `cm_${commentSeq++}`,
    author: order.merchantUsername,
    body,
    createdAt: new Date().toISOString(),
  };
  order.comments.push(comment);
  order.updatedAt = comment.createdAt;
  return structuredClone(comment);
}

/**
 * Record/update the local operational outcome (distinct from provider state).
 * Only permitted when the provider has confirmed the payment.
 */
export async function recordLocalOutcome(
  userId: string,
  orderId: string,
  outcome: Exclude<LocalOutcome, "none">,
): Promise<Order | null> {
  await mockLatency(500);
  const order = orders.find((o) => o.id === orderId && o.merchantId === userId);
  if (!order || order.providerState !== "confirmed") return null;
  order.localOutcome = outcome;
  order.updatedAt = new Date().toISOString();
  return structuredClone(order);
}
