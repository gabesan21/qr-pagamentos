import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPaymentLinkV2Service, createPaymentLinkV2Store } from "../auth/payment-link-v2";
import { PrismaClient } from "../generated/prisma/client";
import { createPrismaStorefrontCartCheckoutStore, createStorefrontCartCheckoutService } from "./storefront-cart-checkout";

const enabled = process.env.STOREFRONT_CART_CHECKOUT_DATABASE_TEST === "1";
const runtimeUrl = process.env.DATABASE_URL;
const adminUrl = process.env.STOREFRONT_CART_CHECKOUT_DATABASE_ADMIN_URL;
const { Client } = pg;

const ownerId = "660e8400-e29b-41d4-a716-446655440030";
const adminOwnerId = "660e8400-e29b-41d4-a716-446655440031";
const disabledOwnerId = "660e8400-e29b-41d4-a716-446655440032";
const closedOwnerId = "660e8400-e29b-41d4-a716-446655440033";
const nullCodeOwnerId = "660e8400-e29b-41d4-a716-446655440034";
const unmappedOwnerId = "660e8400-e29b-41d4-a716-446655440035";
const slug = "cart-database-store";
const pairId = "330e8400-e29b-41d4-a716-446655440031";
const currencyUuid = "440e8400-e29b-41d4-a716-446655440032";
const exchangeCurrencyUuid = "550e8400-e29b-41d4-a716-446655440033";
const products = {
  coffee: "110e8400-e29b-41d4-a716-446655440040",
  tea: "110e8400-e29b-41d4-a716-446655440041",
  cake: "110e8400-e29b-41d4-a716-446655440042",
  inactive: "110e8400-e29b-41d4-a716-446655440043",
  archived: "110e8400-e29b-41d4-a716-446655440044",
  foreign: "110e8400-e29b-41d4-a716-446655440045",
  unmapped: "110e8400-e29b-41d4-a716-446655440046",
};

const allOwnerIds = [ownerId, adminOwnerId, disabledOwnerId, closedOwnerId, nullCodeOwnerId, unmappedOwnerId];

describe.skipIf(!enabled)("storefront cart checkout PostgreSQL contract", () => {
  let prisma: PrismaClient;
  let admin: pg.Client;
  let service: ReturnType<typeof createStorefrontCartCheckoutService>;

  beforeAll(async () => {
    if (!runtimeUrl || !adminUrl) throw new Error("Disposable storefront cart checkout database URLs are required");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: runtimeUrl }) });
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(
      `INSERT INTO app."user" (id, username, role, status, storefront_slug, storefront_enabled, storefront_default_currency_code)
       VALUES ($1, 'cart.db.owner', 'USER', 'ACTIVE', 'cart-database-store', TRUE, 'BRL'),
              ($2, 'cart.db.admin', 'ADMIN', 'ACTIVE', 'cart-database-admin', TRUE, 'BRL'),
              ($3, 'cart.db.disabled', 'USER', 'DISABLED', 'cart-database-disabled', TRUE, 'BRL'),
              ($4, 'cart.db.closed', 'USER', 'ACTIVE', 'cart-database-closed', FALSE, 'BRL'),
              ($5, 'cart.db.nullcode', 'USER', 'ACTIVE', 'cart-database-null-code', TRUE, NULL),
              ($6, 'cart.db.unmapped', 'USER', 'ACTIVE', 'cart-database-unmapped', TRUE, 'USD')`,
      allOwnerIds,
    );
    await admin.query(
      `INSERT INTO app.catalog_currency_pair (id, label, currency_uuid, exchange_currency_uuid)
       VALUES ($1, 'cart.database.pair', $2, $3)`,
      [pairId, currencyUuid, exchangeCurrencyUuid],
    );
    await admin.query(`INSERT INTO app.supported_exchange_currency (code, pair_id) VALUES ('BRL', $1)`, [pairId]);
    await admin.query(
      `INSERT INTO app.product (id, owner_id, internal_name, title_pt_br, title_en, description_pt_br, description_en, price, currency_code, active, archived_at)
       VALUES ($1, $7, 'Coffee', 'Café', 'Coffee', 'd', 'd', '12.5', NULL, TRUE, NULL),
              ($2, $7, 'Tea', 'Chá', 'Tea', 'd', 'd', '9', 'BRL', TRUE, NULL),
              ($3, $7, 'Cake', 'Bolo', 'Cake', 'd', 'd', '4.25', 'USD', TRUE, NULL),
              ($4, $7, 'Inactive', 'Inativo', 'Inactive', 'd', 'd', '1', NULL, FALSE, NULL),
              ($5, $7, 'Archived', 'Arquivado', 'Archived', 'd', 'd', '1', NULL, FALSE, CURRENT_TIMESTAMP),
              ($6, $8, 'Foreign', 'Alheio', 'Foreign', 'd', 'd', '1', NULL, TRUE, NULL),
              ($9, $10, 'Unmapped', 'Sem par', 'Unmapped', 'd', 'd', '1', NULL, TRUE, NULL)`,
      [products.coffee, products.tea, products.cake, products.inactive, products.archived, products.foreign, ownerId, nullCodeOwnerId, products.unmapped, unmappedOwnerId],
    );
    const links = createPaymentLinkV2Service(createPaymentLinkV2Store(prisma));
    service = createStorefrontCartCheckoutService(createPrismaStorefrontCartCheckoutStore(prisma as never), {
      issueLink: (actor, input) => links.create(actor, input),
    });
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM app.payment_link_v2_line WHERE owner_id = ANY($1::uuid[])`, [allOwnerIds]);
    await admin.query(`DELETE FROM app.payment_link_v2 WHERE owner_id = ANY($1::uuid[])`, [allOwnerIds]);
    await admin.query(`DELETE FROM app.product WHERE owner_id = ANY($1::uuid[])`, [allOwnerIds]);
    await admin.query(`DELETE FROM app.supported_exchange_currency WHERE code = 'BRL' AND pair_id = $1`, [pairId]);
    await admin.query(`DELETE FROM app.catalog_currency_pair WHERE id = $1`, [pairId]);
    await admin.query(`DELETE FROM app."user" WHERE id = ANY($1::uuid[])`, [allOwnerIds]);
    await admin.end();
    await prisma.$disconnect();
  });

  it("issues exactly one owner-derived active SINGLE_USE PRODUCT_LINES link with no order, attempt, or provider side effect", async () => {
    const cart = { items: [{ reference: products.coffee, quantity: 2 }, { reference: products.tea, quantity: 1 }] };
    const first = await service.checkout(slug, cart);
    expect(first).toEqual({ kind: "issued", paymentLinkIdentifier: expect.stringMatching(/^[A-Za-z0-9_-]{24}$/) });
    const identifier = first.kind === "issued" ? first.paymentLinkIdentifier : "";

    const links = await admin.query(
      `SELECT owner_id, composition_kind, link_type, active, expires_at, currency_pair_id, version, description_pt_br, amount
       FROM app.payment_link_v2 WHERE identifier = $1`,
      [identifier],
    );
    expect(links.rows).toEqual([{
      owner_id: ownerId,
      composition_kind: "PRODUCT_LINES",
      link_type: "SINGLE_USE",
      active: true,
      expires_at: null,
      currency_pair_id: pairId,
      version: 0,
      description_pt_br: null,
      amount: null,
    }]);
    const lines = await admin.query(
      `SELECT product_id, position, quantity FROM app.payment_link_v2_line WHERE owner_id = $1 ORDER BY position`,
      [ownerId],
    );
    expect(lines.rows).toEqual([
      { product_id: products.coffee, position: 1, quantity: 2 },
      { product_id: products.tea, position: 2, quantity: 1 },
    ]);

    for (const table of ["order_v2", "checkout_attempt_v2", "standalone_checkout_attempt", "provider_order", "provider_quote"]) {
      const sideEffects = await admin.query(`SELECT count(*)::int AS count FROM app.${table} WHERE owner_id = $1`, [ownerId]);
      expect(sideEffects.rows[0].count).toBe(0);
    }

    const second = await service.checkout(slug, cart);
    expect(second.kind).toBe("issued");
    expect(second.kind === "issued" && second.paymentLinkIdentifier).not.toBe(identifier);
    const total = await admin.query(`SELECT count(*)::int AS count FROM app.payment_link_v2 WHERE owner_id = $1`, [ownerId]);
    expect(total.rows[0].count).toBe(2);
  });

  it("keeps unknown, disabled, non-merchant, and closed storefronts one opaque unavailable with zero links", async () => {
    const cart = { items: [{ reference: products.coffee, quantity: 1 }] };
    for (const candidate of ["unknown-cart-store", "cart-database-admin", "cart-database-disabled", "cart-database-closed"]) {
      await expect(service.checkout(candidate, cart)).resolves.toEqual({ kind: "unavailable" });
    }
    const total = await admin.query(`SELECT count(*)::int AS count FROM app.payment_link_v2 WHERE owner_id = ANY($1::uuid[])`, [[adminOwnerId, disabledOwnerId, closedOwnerId]]);
    expect(total.rows[0].count).toBe(0);
  });

  it("keeps stale, cross-owner, inactive, archived, mixed-currency, and unmapped carts one opaque invalid with zero links", async () => {
    const cases: Array<{ slug: string; body: unknown }> = [
      { slug, body: { items: [{ reference: "99999999-9999-4999-8999-999999999999", quantity: 1 }] } },
      { slug, body: { items: [{ reference: products.foreign, quantity: 1 }] } },
      { slug, body: { items: [{ reference: products.inactive, quantity: 1 }] } },
      { slug, body: { items: [{ reference: products.archived, quantity: 1 }] } },
      { slug, body: { items: [{ reference: products.coffee, quantity: 1 }, { reference: products.cake, quantity: 1 }] } },
      { slug: "cart-database-null-code", body: { items: [{ reference: products.foreign, quantity: 1 }] } },
      { slug: "cart-database-unmapped", body: { items: [{ reference: products.unmapped, quantity: 1 }] } },
    ];
    for (const { slug: candidate, body } of cases) {
      await expect(service.checkout(candidate, body)).resolves.toEqual({ kind: "invalid" });
    }
    const total = await admin.query(`SELECT count(*)::int AS count FROM app.payment_link_v2 WHERE owner_id = ANY($1::uuid[])`, [[nullCodeOwnerId, unmappedOwnerId]]);
    expect(total.rows[0].count).toBe(0);
    const owned = await admin.query(`SELECT count(*)::int AS count FROM app.payment_link_v2 WHERE owner_id = $1`, [ownerId]);
    expect(owned.rows[0].count).toBe(2);
  });
});
