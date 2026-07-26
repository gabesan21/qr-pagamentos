import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PrismaClient } from "../generated/prisma/client";
import { createPrismaCheckoutV2Store, createPublicCheckoutV2Service } from "./public-checkout-v2";

const enabled = process.env.PUBLIC_CHECKOUT_V2_DATABASE_TEST === "1";
const runtimeUrl = process.env.DATABASE_URL;
const adminUrl = process.env.PUBLIC_CHECKOUT_V2_DATABASE_ADMIN_URL;
const { Client } = pg;

const ownerId = "770e8400-e29b-41d4-a716-446655440030";
const pairId = "330e8400-e29b-41d4-a716-446655440031";
const currencyUuid = "440e8400-e29b-41d4-a716-446655440032";
const exchangeCurrencyUuid = "550e8400-e29b-41d4-a716-446655440033";
const productAId = "660e8400-e29b-41d4-a716-446655440034";
const productBId = "660e8400-e29b-41d4-a716-446655440035";
const linesLinkId = "110e8400-e29b-41d4-a716-446655440036";
const singleUseLinkId = "110e8400-e29b-41d4-a716-446655440037";
const inactiveLinkId = "110e8400-e29b-41d4-a716-446655440038";
const expiredLinkId = "110e8400-e29b-41d4-a716-446655440039";
const linesIdentifier = "v2dbLinesLink00000000001";
const singleUseIdentifier = "v2dbSingleLink0000000001";
const inactiveIdentifier = "v2dbInactiveLink00000001";
const expiredIdentifier = "v2dbExpiredLink000000001";
const unknownIdentifier = "v2dbUnknownLink000000001";
const key = Buffer.alloc(32, 9);
const now = new Date("2026-07-26T15:00:00.000Z");
const customer = { name: null, email: null, cpf: null, address: null };

describe.skipIf(!enabled)("public checkout V2 PostgreSQL contract", () => {
  let prisma: PrismaClient;
  let admin: pg.Client;
  let provider: { quote: ReturnType<typeof vi.fn>; createOrder: ReturnType<typeof vi.fn> };
  let service: ReturnType<typeof createPublicCheckoutV2Service>;

  beforeAll(async () => {
    if (!runtimeUrl || !adminUrl) throw new Error("Disposable public checkout V2 database URLs are required");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: runtimeUrl }) });
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(
      `INSERT INTO app."user" (id, username, role, status) VALUES ($1, 'checkout.v2.db.owner', 'USER', 'ACTIVE')`,
      [ownerId],
    );
    await admin.query(
      `INSERT INTO app.catalog_currency_pair (id, label, currency_uuid, exchange_currency_uuid)
       VALUES ($1, 'checkout.v2.database.pair', $2, $3)`,
      [pairId, currencyUuid, exchangeCurrencyUuid],
    );
    await admin.query(
      `INSERT INTO app.product (id, owner_id, internal_name, title_pt_br, title_en, description_pt_br, description_en, price, active, version, created_at, updated_at)
       VALUES ($1, $3, 'db.espresso', 'Café expresso', 'Espresso shot', 'Descrição', 'Description', '12.5', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
              ($2, $3, 'db.filter', 'Café coado', 'Filter coffee', 'Descrição', 'Description', '9.9', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [productAId, productBId, ownerId],
    );
    await admin.query(
      `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, currency_pair_id, link_type, active, version, created_at, updated_at)
       VALUES ($1, $2, $3, 'PRODUCT_LINES', $4, 'REUSABLE', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [linesLinkId, linesIdentifier, ownerId, pairId],
    );
    await admin.query(
      `INSERT INTO app.payment_link_v2_line (payment_link_v2_id, owner_id, product_id, position, quantity)
       VALUES ($1, $2, $3, 1, 2), ($1, $2, $4, 2, 1)`,
      [linesLinkId, ownerId, productAId, productBId],
    );
    await admin.query(
      `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, active, version, created_at, updated_at)
       VALUES ($1, $2, $3, 'FIXED_AMOUNT', 'Doação mensal', 'Monthly donation', '10.50', $4, 'SINGLE_USE', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [singleUseLinkId, singleUseIdentifier, ownerId, pairId],
    );
    await admin.query(
      `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, active, version, created_at, updated_at)
       VALUES ($1, $2, $3, 'FIXED_AMOUNT', 'Campanha encerrada', 'Closed campaign', '40', $4, 'REUSABLE', false, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [inactiveLinkId, inactiveIdentifier, ownerId, pairId],
    );
    await admin.query(
      `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, expires_at, active, version, created_at, updated_at)
       VALUES ($1, $2, $3, 'FIXED_AMOUNT', 'Lote antigo', 'Old batch', '55', $4, 'REUSABLE', '2026-07-26T14:00:00.000Z', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [expiredLinkId, expiredIdentifier, ownerId, pairId],
    );
    provider = { quote: vi.fn(async () => ({ quoteUuid: randomUUID(), expiresAt: new Date("2026-07-26T15:05:00.000Z") })), createOrder: vi.fn(async () => ({})) };
    service = createPublicCheckoutV2Service(createPrismaCheckoutV2Store(prisma as never, key), {
      now: () => now,
      capabilityKey: () => key,
      provider: provider as never,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM app.provider_order WHERE owner_id = $1`, [ownerId]);
    await admin.query(`DELETE FROM app.provider_quote WHERE owner_id = $1`, [ownerId]);
    await admin.query(`DELETE FROM app.checkout_attempt_v2 WHERE owner_id = $1`, [ownerId]);
    await admin.query(`DELETE FROM app.payment_link_v2_single_use_settlement WHERE owner_id = $1`, [ownerId]);
    await admin.query(`DELETE FROM app.order_v2_line WHERE owner_id = $1`, [ownerId]);
    await admin.query(`DELETE FROM app.order_v2 WHERE owner_id = $1`, [ownerId]);
    await admin.query(`DELETE FROM app.payment_link_v2_line WHERE owner_id = $1`, [ownerId]);
    await admin.query(`DELETE FROM app.payment_link_v2 WHERE owner_id = $1`, [ownerId]);
    await admin.query(`DELETE FROM app.product WHERE owner_id = $1`, [ownerId]);
    await admin.query(`DELETE FROM app.catalog_currency_pair WHERE id = $1`, [pairId]);
    await admin.query(`DELETE FROM app."user" WHERE id = $1`, [ownerId]);
    await admin.end();
    await prisma.$disconnect();
  });

  it("reserves, dispatches, and replays a product-lines checkout with zero provider calls on replay", async () => {
    const body = { idempotencyKey: "database-v2-retry-0001", customer };
    const first = await service.checkout(linesIdentifier, body);
    expect(first).toMatchObject({ kind: "accepted", status: 201, payment: { state: "PENDING" } });
    const capability = first.kind === "accepted" ? first.statusCapability : "";
    expect(capability).not.toBe("");
    expect(provider.createOrder).toHaveBeenCalledTimes(1);

    const orders = await admin.query(
      `SELECT id, source, payment_link_v2_id, state, amount, currency_uuid, exchange_currency_uuid, checkout_data_policy
       FROM app.order_v2 WHERE owner_id = $1 AND payment_link_v2_id = $2`,
      [ownerId, linesLinkId],
    );
    expect(orders.rows).toHaveLength(1);
    expect(orders.rows[0]).toMatchObject({
      source: "LINK",
      payment_link_v2_id: linesLinkId,
      state: "PENDING",
      amount: "34.9",
      currency_uuid: currencyUuid,
      exchange_currency_uuid: exchangeCurrencyUuid,
      checkout_data_policy: "NONE",
    });
    const lines = await admin.query(
      `SELECT product_id, position, quantity, unit_price FROM app.order_v2_line WHERE order_id = $1 ORDER BY position ASC`,
      [orders.rows[0].id],
    );
    expect(lines.rows).toEqual([
      { product_id: productAId, position: 1, quantity: 2, unit_price: "12.5" },
      { product_id: productBId, position: 2, quantity: 1, unit_price: "9.9" },
    ]);

    const replay = await service.checkout(linesIdentifier, body);
    expect(replay).toMatchObject({ kind: "accepted", status: 201, statusCapability: capability });
    expect(provider.quote).toHaveBeenCalledTimes(1);
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
  });

  it("rejects a consumed single-use link without a new order or provider call", async () => {
    const first = await service.checkout(singleUseIdentifier, { idempotencyKey: "database-v2-retry-0002", customer });
    expect(first).toMatchObject({ kind: "accepted", status: 201 });
    const order = await admin.query(`SELECT id FROM app.order_v2 WHERE owner_id = $1 AND payment_link_v2_id = $2`, [ownerId, singleUseLinkId]);
    expect(order.rows).toHaveLength(1);

    await admin.query(
      `INSERT INTO app.payment_link_v2_single_use_settlement (payment_link_v2_id, owner_id, order_v2_id, claimed_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [singleUseLinkId, ownerId, order.rows[0].id],
    );
    // New requests and even exact replays are rejected once the claim exists;
    // status polling keeps working through the already-issued capability.
    await expect(service.checkout(singleUseIdentifier, { idempotencyKey: "database-v2-retry-0003", customer })).resolves.toEqual({ kind: "unavailable" });
    await expect(service.checkout(singleUseIdentifier, { idempotencyKey: "database-v2-retry-0002", customer })).resolves.toEqual({ kind: "unavailable" });
    expect(provider.quote).toHaveBeenCalledTimes(1);
    const orders = await admin.query(`SELECT count(*)::int AS count FROM app.order_v2 WHERE owner_id = $1 AND payment_link_v2_id = $2`, [ownerId, singleUseLinkId]);
    expect(orders.rows[0].count).toBe(1);
  });

  it("keeps unknown, inactive, and expired identifiers one opaque unavailable outcome", async () => {
    for (const candidate of [unknownIdentifier, inactiveIdentifier, expiredIdentifier]) {
      await expect(service.checkout(candidate, { idempotencyKey: "database-v2-retry-x0001", customer })).resolves.toEqual({ kind: "unavailable" });
    }
    expect(provider.quote).not.toHaveBeenCalled();
    const attempts = await admin.query(`SELECT count(*)::int AS count FROM app.checkout_attempt_v2 WHERE payment_link_v2_id = ANY($1::uuid[])`, [[inactiveLinkId, expiredLinkId]]);
    expect(attempts.rows[0].count).toBe(0);
  });
});
