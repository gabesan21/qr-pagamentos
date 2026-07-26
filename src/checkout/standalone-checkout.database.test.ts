import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PrismaClient } from "../generated/prisma/client";
import { createOrderV2Service, createOrderV2Store, STANDALONE_ORDER_DESCRIPTION } from "../orders/order-v2";
import { createPrismaStandaloneCheckoutStore, createStandaloneCheckoutService } from "./standalone-checkout";

const enabled = process.env.STANDALONE_CHECKOUT_DATABASE_TEST === "1";
const runtimeUrl = process.env.DATABASE_URL;
const adminUrl = process.env.STANDALONE_CHECKOUT_DATABASE_ADMIN_URL;
const { Client } = pg;

const ownerId = "770e8400-e29b-41d4-a716-446655440020";
const nullCodeOwnerId = "770e8400-e29b-41d4-a716-446655440021";
const unmappedCodeOwnerId = "770e8400-e29b-41d4-a716-446655440022";
const slug = "standalone-database-store";
const nullCodeSlug = "standalone-database-null-code";
const unmappedCodeSlug = "standalone-database-unmapped";
const pairId = "330e8400-e29b-41d4-a716-446655440021";
const currencyUuid = "440e8400-e29b-41d4-a716-446655440022";
const exchangeCurrencyUuid = "550e8400-e29b-41d4-a716-446655440023";
const key = Buffer.alloc(32, 9);
const now = new Date("2026-07-26T15:00:00.000Z");
const customer = { name: null, email: null, cpf: null, address: null };
const body = { idempotencyKey: "database-retry-key-0001", amount: "12.5", customer };

describe.skipIf(!enabled)("standalone checkout PostgreSQL contract", () => {
  let prisma: PrismaClient;
  let admin: pg.Client;
  let provider: { quote: ReturnType<typeof vi.fn>; createOrder: ReturnType<typeof vi.fn> };
  let service: ReturnType<typeof createStandaloneCheckoutService>;

  beforeAll(async () => {
    if (!runtimeUrl || !adminUrl) throw new Error("Disposable standalone checkout database URLs are required");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: runtimeUrl }) });
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(
      `INSERT INTO app."user" (id, username, role, status, storefront_slug, storefront_enabled, storefront_standalone_payments_enabled, storefront_default_currency_code)
       VALUES ($1, 'standalone.db.owner', 'USER', 'ACTIVE', $4, TRUE, TRUE, 'BRL'),
              ($2, 'standalone.db.nullcode', 'USER', 'ACTIVE', $5, TRUE, TRUE, NULL),
              ($3, 'standalone.db.unmapped', 'USER', 'ACTIVE', $6, TRUE, TRUE, 'USD')`,
      [ownerId, nullCodeOwnerId, unmappedCodeOwnerId, slug, nullCodeSlug, unmappedCodeSlug],
    );
    await admin.query(
      `INSERT INTO app.catalog_currency_pair (id, label, currency_uuid, exchange_currency_uuid)
       VALUES ($1, 'standalone.database.pair', $2, $3)`,
      [pairId, currencyUuid, exchangeCurrencyUuid],
    );
    await admin.query(`INSERT INTO app.supported_exchange_currency (code, pair_id) VALUES ('BRL', $1)`, [pairId]);
    provider = { quote: vi.fn(async () => ({ quoteUuid: randomUUID(), expiresAt: new Date("2026-07-26T15:05:00.000Z") })), createOrder: vi.fn(async () => ({})) };
    service = createStandaloneCheckoutService(createPrismaStandaloneCheckoutStore(prisma as never, key), {
      now: () => now,
      capabilityKey: () => key,
      provider: provider as never,
    });
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM app.provider_order WHERE owner_id = $1`, [ownerId]);
    await admin.query(`DELETE FROM app.provider_quote WHERE owner_id = $1`, [ownerId]);
    await admin.query(`DELETE FROM app.standalone_checkout_attempt WHERE owner_id = ANY($1::uuid[])`, [[ownerId, nullCodeOwnerId, unmappedCodeOwnerId]]);
    await admin.query(`DELETE FROM app.order_v2 WHERE owner_id = ANY($1::uuid[])`, [[ownerId, nullCodeOwnerId, unmappedCodeOwnerId]]);
    await admin.query(`DELETE FROM app.supported_exchange_currency WHERE code = 'BRL' AND pair_id = $1`, [pairId]);
    await admin.query(`DELETE FROM app.catalog_currency_pair WHERE id = $1`, [pairId]);
    await admin.query(`DELETE FROM app."user" WHERE id = ANY($1::uuid[])`, [[ownerId, nullCodeOwnerId, unmappedCodeOwnerId]]);
    await admin.end();
    await prisma.$disconnect();
  });

  it("reserves, dispatches, and replays the sessionless checkout with zero provider calls on replay", async () => {
    const first = await service.checkout(slug, body);
    expect(first).toMatchObject({ kind: "accepted", status: 201, payment: { state: "PENDING" } });
    const capability = first.kind === "accepted" ? first.statusCapability : "";
    expect(capability).not.toBe("");

    const orders = await admin.query(
      `SELECT source, payment_link_v2_id, state, amount, currency_uuid, exchange_currency_uuid, description_pt_br, description_en, checkout_data_policy
       FROM app.order_v2 WHERE owner_id = $1`,
      [ownerId],
    );
    expect(orders.rows).toEqual([{
      source: "STANDALONE",
      payment_link_v2_id: null,
      state: "PENDING",
      amount: "12.5",
      currency_uuid: currencyUuid,
      exchange_currency_uuid: exchangeCurrencyUuid,
      description_pt_br: STANDALONE_ORDER_DESCRIPTION.ptBr,
      description_en: STANDALONE_ORDER_DESCRIPTION.en,
      checkout_data_policy: "NONE",
    }]);

    const replay = await service.checkout(slug, body);
    expect(replay).toMatchObject({ kind: "accepted", status: 201, statusCapability: capability });
    expect(provider.quote).toHaveBeenCalledTimes(1);
    expect(provider.createOrder).toHaveBeenCalledTimes(1);

    await expect(service.checkout(slug, { ...body, amount: "13.00" })).resolves.toEqual({ kind: "unavailable" });
    expect(provider.quote).toHaveBeenCalledTimes(1);

    await admin.query(`UPDATE app."user" SET storefront_standalone_payments_enabled = FALSE WHERE id = $1`, [ownerId]);
    await expect(service.checkout(slug, body)).resolves.toEqual({ kind: "unavailable" });
    await admin.query(`UPDATE app."user" SET storefront_standalone_payments_enabled = TRUE WHERE id = $1`, [ownerId]);
    expect(provider.quote).toHaveBeenCalledTimes(1);
  });

  it("keeps slug, toggle, and currency failures one opaque unavailable outcome", async () => {
    for (const candidate of ["unknown-slug", nullCodeSlug, unmappedCodeSlug]) {
      await expect(service.checkout(candidate, { ...body, idempotencyKey: `database-retry-${candidate}` })).resolves.toEqual({ kind: "unavailable" });
    }
    expect(provider.quote).not.toHaveBeenCalled();
    const attempts = await admin.query(`SELECT count(*)::int AS count FROM app.standalone_checkout_attempt WHERE owner_id = ANY($1::uuid[])`, [[nullCodeOwnerId, unmappedCodeOwnerId]]);
    expect(attempts.rows[0].count).toBe(0);
  });

  it("settles a link-less standalone order through the versioned CAS without a single-use claim", async () => {
    const checkout = await service.checkout(slug, { ...body, idempotencyKey: "database-retry-key-0002" });
    expect(checkout).toMatchObject({ kind: "accepted", status: 201 });
    const order = await admin.query(`SELECT id FROM app.order_v2 WHERE owner_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`, [ownerId]);
    const orderV2Id = order.rows[0].id as string;

    const providerOrderUuid = randomUUID();
    await admin.query(`INSERT INTO app.provider_quote (quote_uuid, owner_id, expires_at, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [randomUUID(), ownerId]);
    const quote = await admin.query(`SELECT quote_uuid FROM app.provider_quote WHERE owner_id = $1 LIMIT 1`, [ownerId]);
    const providerOrder = await admin.query(
      `INSERT INTO app.provider_order (owner_id, quote_uuid, order_v2_id, provider_order_uuid, creation_state, status, reconciliation_version)
       VALUES ($1, $2, $3, $4, 'CREATED', 'finished', 1) RETURNING id`,
      [ownerId, quote.rows[0].quote_uuid, orderV2Id, providerOrderUuid],
    );
    const providerOrderId = providerOrder.rows[0].id as string;

    const orders = createOrderV2Service(createOrderV2Store(prisma));
    const settled = await orders.settle({
      ownerId,
      orderV2Id,
      providerOrderId,
      providerOrderUuid,
      observedProviderReconciliationVersion: 1,
      observedLocalLifecycleVersion: 0,
      authoritativeProviderStatus: "finished",
    });
    expect(settled).toEqual({ kind: "settled", state: "CONFIRMED" });

    const confirmed = await admin.query(`SELECT state, lifecycle_version, settled_at FROM app.order_v2 WHERE id = $1`, [orderV2Id]);
    expect(confirmed.rows[0].state).toBe("CONFIRMED");
    expect(confirmed.rows[0].lifecycle_version).toBe(1);
    expect(confirmed.rows[0].settled_at).not.toBeNull();
    const claims = await admin.query(`SELECT count(*)::int AS count FROM app.payment_link_v2_single_use_settlement WHERE owner_id = $1`, [ownerId]);
    expect(claims.rows[0].count).toBe(0);

    await expect(orders.settle({
      ownerId,
      orderV2Id,
      providerOrderId,
      providerOrderUuid,
      observedProviderReconciliationVersion: 1,
      observedLocalLifecycleVersion: 0,
      authoritativeProviderStatus: "finished",
    })).resolves.toEqual({ kind: "no-op" });
  });
});
