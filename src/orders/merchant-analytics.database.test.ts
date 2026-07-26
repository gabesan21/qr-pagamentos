import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PrismaClient } from "../generated/prisma/client";
import { createMerchantAnalyticsService, createPrismaMerchantAnalyticsStore } from "./merchant-analytics";

const enabled = process.env.MERCHANT_ANALYTICS_DATABASE_TEST === "1";
const runtimeUrl = process.env.DATABASE_URL;
const adminUrl = process.env.MERCHANT_ANALYTICS_DATABASE_ADMIN_URL;
const { Client } = pg;

// Fixed read instant: 2026-07-20 12:00 in America/Sao_Paulo. The 30d period is
// [2026-06-21T03:00Z, 2026-07-21T03:00Z); today is [2026-07-20T03:00Z, ...).
const NOW = new Date("2026-07-20T15:00:00.000Z");

const ownerAId = "110e8400-e29b-41d4-a716-4466554400a1";
const ownerBId = "220e8400-e29b-41d4-a716-4466554400b2";
const pairA1Id = "310e8400-e29b-41d4-a716-446655440011";
const pairA2Id = "320e8400-e29b-41d4-a716-446655440022";
const pairB1Id = "330e8400-e29b-41d4-a716-446655440033";
const pairA1 = { currencyUuid: "410e8400-e29b-41d4-a716-446655440041", exchangeCurrencyUuid: "420e8400-e29b-41d4-a716-446655440042" };
const pairA2 = { currencyUuid: "430e8400-e29b-41d4-a716-446655440043", exchangeCurrencyUuid: "440e8400-e29b-41d4-a716-446655440044" };
const pairB1 = { currencyUuid: "450e8400-e29b-41d4-a716-446655440045", exchangeCurrencyUuid: "460e8400-e29b-41d4-a716-446655440046" };
const productAId = "510e8400-e29b-41d4-a716-446655440051";
const productBId = "520e8400-e29b-41d4-a716-446655440052";
const productCId = "530e8400-e29b-41d4-a716-446655440053";
const linkAId = "610e8400-e29b-41d4-a716-446655440061";
const linkBId = "620e8400-e29b-41d4-a716-446655440062";
const linkCId = "630e8400-e29b-41d4-a716-446655440063";

const ownerA = { id: ownerAId, username: "analytics.owner.a", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: NOW };
const ownerB = { ...ownerA, id: ownerBId, username: "analytics.owner.b" };

let orderSequence = 0;
function orderId() {
  orderSequence += 1;
  return `710e8400-e29b-41d4-a716-44665544${String(orderSequence).padStart(4, "0")}`;
}
let attemptSequence = 0;
function attemptId() {
  attemptSequence += 1;
  return `810e8400-e29b-41d4-a716-44665544${String(attemptSequence).padStart(4, "0")}`;
}
let outcomeSequence = 0;
function outcomeId() {
  outcomeSequence += 1;
  return `910e8400-e29b-41d4-a716-44665544${String(outcomeSequence).padStart(4, "0")}`;
}

type SeedOrder = Readonly<{
  ownerId: string;
  source: "LINK" | "AD_HOC" | "STANDALONE";
  linkId?: string;
  state?: string;
  amount: string;
  pair: typeof pairA1;
  settledAt?: string;
  createdAt: string;
  lines?: ReadonlyArray<Readonly<{ productId: string; quantity: number; unitPrice: string }>>;
}>;

async function seedOrder(admin: pg.Client, order: SeedOrder): Promise<string> {
  const id = orderId();
  await admin.query(
    `INSERT INTO app.order_v2
       (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount,
        currency_uuid, exchange_currency_uuid, description_pt_br, description_en,
        checkout_data_policy, settled_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, 'Doação', 'Donation', 'NONE', $9, $10, $10)`,
    [id, order.ownerId, order.source, order.linkId ?? null, order.state ?? null, order.amount,
      order.pair.currencyUuid, order.pair.exchangeCurrencyUuid, order.settledAt ?? null, order.createdAt],
  );
  let position = 0;
  for (const line of order.lines ?? []) {
    position += 1;
    await admin.query(
      `INSERT INTO app.order_v2_line (order_id, owner_id, product_id, position, quantity, unit_price)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, order.ownerId, line.productId, position, line.quantity, line.unitPrice],
    );
  }
  return id;
}

async function seedOutcome(admin: pg.Client, ownerId: string, orderV2Id: string, outcome: string, createdAt: string) {
  await admin.query(
    `INSERT INTO app.order_local_outcome_v2 (id, order_id, owner_id, outcome, actor_id, created_at)
     VALUES ($1, $2, $3, $4, $3, $5)`,
    [outcomeId(), orderV2Id, ownerId, outcome, createdAt],
  );
}

async function seedAttempt(admin: pg.Client, ownerId: string, linkId: string, orderV2Id: string, expiresAt: string, createdAt: string) {
  const id = attemptId();
  await admin.query(
    `INSERT INTO app.checkout_attempt_v2
       (id, owner_id, payment_link_v2_id, order_v2_id, retry_key_verifier, request_verifier,
        capability_nonce, capability_key_version, capability_verifier, capability_expires_at,
        state, created_at, updated_at)
     VALUES ($1, $2, $3, $4, md5($7), md5($7), md5($7), 'v1', md5($7), $5, 'PENDING', $6, $6)`,
    [id, ownerId, linkId, orderV2Id, expiresAt, createdAt, id],
  );
}

async function seedStandaloneAttempt(admin: pg.Client, ownerId: string, orderV2Id: string, expiresAt: string, createdAt: string) {
  const id = attemptId();
  await admin.query(
    `INSERT INTO app.standalone_checkout_attempt
       (id, owner_id, order_v2_id, retry_key_verifier, request_verifier,
        capability_nonce, capability_key_version, capability_verifier, capability_expires_at,
        state, created_at, updated_at)
     VALUES ($1, $2, $3, md5($6), md5($6), md5($6), 'v1', md5($6), $4, 'PENDING', $5, $5)`,
    [id, ownerId, orderV2Id, expiresAt, createdAt, id],
  );
}

describe.skipIf(!enabled)("merchant analytics PostgreSQL contract", () => {
  let database: PrismaClient;
  let admin: pg.Client;

  beforeAll(async () => {
    if (!runtimeUrl || !adminUrl) throw new Error("Disposable analytics database URLs are required");
    database = new PrismaClient({ adapter: new PrismaPg({ connectionString: runtimeUrl }) });
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();

    await admin.query(
      `INSERT INTO app."user" (id, username, role, status) VALUES
         ($1, 'analytics.owner.a', 'USER', 'ACTIVE'),
         ($2, 'analytics.owner.b', 'USER', 'ACTIVE')`,
      [ownerAId, ownerBId],
    );
    await admin.query(
      `INSERT INTO app.catalog_currency_pair (id, label, currency_uuid, exchange_currency_uuid) VALUES
         ($1, 'BRL via PIX', $4, $5),
         ($2, 'USD pair', $6, $7),
         ($3, 'B pair', $8, $9)`,
      [pairA1Id, pairA2Id, pairB1Id,
        pairA1.currencyUuid, pairA1.exchangeCurrencyUuid,
        pairA2.currencyUuid, pairA2.exchangeCurrencyUuid,
        pairB1.currencyUuid, pairB1.exchangeCurrencyUuid],
    );
    await admin.query(
      `INSERT INTO app.supported_exchange_currency (code, pair_id) VALUES ('BRL', $1), ('USD', $2)`,
      [pairA1Id, pairA2Id],
    );
    await admin.query(
      `INSERT INTO app.product
         (id, owner_id, internal_name, title_pt_br, title_en, description_pt_br, description_en, price, active, archived_at)
       VALUES
         ($1, $3, 'analytics-a', 'Café', 'Coffee', 'Café', 'Coffee', '0.1', TRUE, NULL),
         ($2, $3, 'analytics-b', 'Bolo', 'Cake', 'Bolo', 'Cake', '1', FALSE, '2026-07-01T00:00:00Z'),
         ($4, $5, 'analytics-c', 'Produto B', 'Product B', 'Produto B', 'Product B', '1000', TRUE, NULL)`,
      [productAId, productBId, ownerAId, productCId, ownerBId],
    );
    await admin.query(
      `INSERT INTO app.payment_link_v2
         (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount,
          currency_pair_id, link_type, active, version, created_at, updated_at)
       VALUES
         ($1, 'aaaaaaaaaaaaaaaaaaaaaaaa', $4, 'FIXED_AMOUNT', 'Doação', 'Donation', '0.1', $5, 'REUSABLE', TRUE, 0, '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'),
         ($2, 'bbbbbbbbbbbbbbbbbbbbbbbb', $4, 'PRODUCT_LINES', NULL, NULL, NULL, $6, 'REUSABLE', FALSE, 0, '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'),
         ($3, 'cccccccccccccccccccccccc', $7, 'FIXED_AMOUNT', 'Produto B', 'Product B', '1000', $8, 'REUSABLE', TRUE, 0, '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z')`,
      [linkAId, linkBId, linkCId, ownerAId, pairA1Id, pairA2Id, ownerBId, pairB1Id],
    );

    // Owner A sales: 0.1 + 0.2 confirmed on pair A1, 5 confirmed on pair A2;
    // an out-of-period CONFIRMED and a PENDING order must not count.
    const o1 = await seedOrder(admin, { ownerId: ownerAId, source: "LINK", linkId: linkAId, state: "CONFIRMED", amount: "0.1", pair: pairA1, settledAt: "2026-07-19T12:00:00Z", createdAt: "2026-07-19T10:00:00Z", lines: [{ productId: productAId, quantity: 1, unitPrice: "0.1" }] });
    await seedOrder(admin, { ownerId: ownerAId, source: "LINK", linkId: linkAId, state: "CONFIRMED", amount: "0.2", pair: pairA1, settledAt: "2026-07-20T10:00:00Z", createdAt: "2026-07-20T09:00:00Z", lines: [{ productId: productAId, quantity: 2, unitPrice: "0.1" }] });
    await seedOrder(admin, { ownerId: ownerAId, source: "LINK", linkId: linkBId, state: "CONFIRMED", amount: "5", pair: pairA2, settledAt: "2026-07-20T11:00:00Z", createdAt: "2026-07-20T10:30:00Z", lines: [{ productId: productBId, quantity: 5, unitPrice: "1" }] });
    await seedOrder(admin, { ownerId: ownerAId, source: "LINK", linkId: linkAId, state: "CONFIRMED", amount: "9", pair: pairA1, settledAt: "2026-05-01T12:00:00Z", createdAt: "2026-05-01T10:00:00Z" });
    await seedOrder(admin, { ownerId: ownerAId, source: "LINK", linkId: linkAId, state: "PENDING", amount: "50", pair: pairA1, createdAt: "2026-07-20T11:30:00Z" });

    // Owner A locally finalized AD_HOC: only the latest in-period FINALIZED counts.
    const o6 = await seedOrder(admin, { ownerId: ownerAId, source: "AD_HOC", amount: "0.3", pair: pairA1, createdAt: "2026-07-10T10:00:00Z" });
    await seedOutcome(admin, ownerAId, o6, "LOCAL_CANCELLED", "2026-07-18T10:00:00Z");
    await seedOutcome(admin, ownerAId, o6, "LOCAL_FINALIZED", "2026-07-19T10:00:00Z");
    const o7 = await seedOrder(admin, { ownerId: ownerAId, source: "AD_HOC", amount: "7", pair: pairA1, createdAt: "2026-07-10T11:00:00Z" });
    await seedOutcome(admin, ownerAId, o7, "LOCAL_FINALIZED", "2026-07-19T11:00:00Z");
    await seedOutcome(admin, ownerAId, o7, "LOCAL_CANCELLED", "2026-07-19T12:00:00Z");
    const o8 = await seedOrder(admin, { ownerId: ownerAId, source: "AD_HOC", amount: "8", pair: pairA1, createdAt: "2026-05-10T10:00:00Z" });
    await seedOutcome(admin, ownerAId, o8, "LOCAL_FINALIZED", "2026-06-01T10:00:00Z");

    // Owner A funnel: converted / boundary-abandoned / abandoned / in-progress /
    // out-of-period. Each attempt binds its own order (order_v2_id is unique).
    const o9 = await seedOrder(admin, { ownerId: ownerAId, source: "LINK", linkId: linkAId, state: "PENDING", amount: "1", pair: pairA1, createdAt: "2026-07-20T08:00:00Z" });
    const o10 = await seedOrder(admin, { ownerId: ownerAId, source: "LINK", linkId: linkBId, state: "CANCELLED", amount: "2", pair: pairA1, createdAt: "2026-07-20T07:00:00Z" });
    const o11 = await seedOrder(admin, { ownerId: ownerAId, source: "LINK", linkId: linkAId, state: "PENDING", amount: "3", pair: pairA1, createdAt: "2026-07-20T06:00:00Z" });
    const o12 = await seedOrder(admin, { ownerId: ownerAId, source: "LINK", linkId: linkAId, state: "PENDING", amount: "4", pair: pairA1, createdAt: "2026-06-01T06:00:00Z" });
    await seedAttempt(admin, ownerAId, linkAId, o1, "2026-07-19T12:00:00Z", "2026-07-19T10:30:00Z"); // converted (order CONFIRMED), capability expired
    await seedAttempt(admin, ownerAId, linkAId, o9, NOW.toISOString(), "2026-07-20T08:30:00Z"); // boundary: expiry exactly at the read instant
    await seedAttempt(admin, ownerAId, linkBId, o10, "2026-07-20T14:00:00Z", "2026-07-20T07:30:00Z"); // abandoned
    await seedAttempt(admin, ownerAId, linkAId, o11, "2026-07-21T15:00:00Z", "2026-07-20T06:30:00Z"); // in progress
    await seedAttempt(admin, ownerAId, linkAId, o12, "2026-06-02T15:00:00Z", "2026-06-01T06:30:00Z"); // created out of period

    // Owner A standalone: one in-period CONFIRMED sale (provider-confirmed group
    // only, no lines, no link) and one converted funnel attempt.
    const o13 = await seedOrder(admin, { ownerId: ownerAId, source: "STANDALONE", state: "CONFIRMED", amount: "0.4", pair: pairA1, settledAt: "2026-07-19T13:00:00Z", createdAt: "2026-07-10T09:00:00Z" });
    await seedStandaloneAttempt(admin, ownerAId, o13, "2026-07-21T15:00:00Z", "2026-07-19T11:30:00Z"); // converted (order CONFIRMED)

    // Owner B mirrors with disjoint values to prove isolation.
    const ob1 = await seedOrder(admin, { ownerId: ownerBId, source: "LINK", linkId: linkCId, state: "CONFIRMED", amount: "1000", pair: pairB1, settledAt: "2026-07-20T09:00:00Z", createdAt: "2026-07-20T08:00:00Z", lines: [{ productId: productCId, quantity: 1, unitPrice: "1000" }] });
    const ob2 = await seedOrder(admin, { ownerId: ownerBId, source: "AD_HOC", amount: "2000", pair: pairB1, createdAt: "2026-07-19T08:00:00Z" });
    await seedOutcome(admin, ownerBId, ob2, "LOCAL_FINALIZED", "2026-07-20T08:00:00Z");
    const ob3 = await seedOrder(admin, { ownerId: ownerBId, source: "LINK", linkId: linkCId, state: "PENDING", amount: "3000", pair: pairB1, createdAt: "2026-07-20T07:00:00Z" });
    await seedAttempt(admin, ownerBId, linkCId, ob1, "2026-07-21T15:00:00Z", "2026-07-20T08:30:00Z"); // converted
    await seedAttempt(admin, ownerBId, linkCId, ob3, "2026-07-20T14:00:00Z", "2026-07-20T07:30:00Z"); // abandoned
  });

  afterAll(async () => {
    if (database) await database.$disconnect();
    if (admin) {
      await admin.query(`DELETE FROM app.checkout_attempt_v2 WHERE owner_id = ANY($1)`, [[ownerAId, ownerBId]]);
      await admin.query(`DELETE FROM app.standalone_checkout_attempt WHERE owner_id = ANY($1)`, [[ownerAId, ownerBId]]);
      await admin.query(`DELETE FROM app.order_local_outcome_v2 WHERE owner_id = ANY($1)`, [[ownerAId, ownerBId]]);
      await admin.query(`DELETE FROM app.order_v2_line WHERE owner_id = ANY($1)`, [[ownerAId, ownerBId]]);
      await admin.query(`DELETE FROM app.order_v2 WHERE owner_id = ANY($1)`, [[ownerAId, ownerBId]]);
      await admin.query(`DELETE FROM app.payment_link_v2 WHERE owner_id = ANY($1)`, [[ownerAId, ownerBId]]);
      await admin.query(`DELETE FROM app.product WHERE owner_id = ANY($1)`, [[ownerAId, ownerBId]]);
      await admin.query(`DELETE FROM app.supported_exchange_currency WHERE pair_id = ANY($1)`, [[pairA1Id, pairA2Id, pairB1Id]]);
      await admin.query(`DELETE FROM app.catalog_currency_pair WHERE id = ANY($1)`, [[pairA1Id, pairA2Id, pairB1Id]]);
      await admin.query(`DELETE FROM app."user" WHERE id = ANY($1)`, [[ownerAId, ownerBId]]);
      await admin.end();
    }
  });

  function service() {
    return createMerchantAnalyticsService(createPrismaMerchantAnalyticsStore(database), { now: () => NOW });
  }

  it("isolates exact per-currency sales per owner and never merges confirmed with locally finalized", async () => {
    const result = await service().getForOwner(ownerA, "30d");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.confirmedSales).toEqual([
      { currency: { code: "USD", label: "USD pair" }, amount: "5", orderCount: 1 },
      { currency: { code: "BRL", label: "BRL via PIX" }, amount: "0.7", orderCount: 3 },
    ]);
    expect(result.view.locallyFinalizedSales).toEqual([
      { currency: { code: "BRL", label: "BRL via PIX" }, amount: "0.3", orderCount: 1 },
    ]);
    const serialized = JSON.stringify(result.view);
    expect(serialized).not.toContain("1000");
    expect(serialized).not.toContain("2000");

    const other = await service().getForOwner(ownerB, "30d");
    if (other.kind !== "ready") throw new Error("expected ready");
    expect(other.view.confirmedSales).toEqual([
      { currency: { code: null, label: "B pair" }, amount: "1000", orderCount: 1 },
    ]);
    expect(other.view.locallyFinalizedSales).toEqual([
      { currency: { code: null, label: "B pair" }, amount: "2000", orderCount: 1 },
    ]);
    expect(JSON.stringify(other.view)).not.toContain('"5"');
  });

  it("derives the funnel from persisted fields with the capability-expiry boundary", async () => {
    const result = await service().getForOwner(ownerA, "30d");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.funnel).toEqual({
      attempts: 5,
      converted: 2,
      abandoned: 2,
      inProgress: 1,
      conversionRate: "0.5000",
      abandonmentRate: "0.5000",
    });

    const other = await service().getForOwner(ownerB, "30d");
    if (other.kind !== "ready") throw new Error("expected ready");
    expect(other.view.funnel).toMatchObject({ attempts: 2, converted: 1, abandoned: 1, inProgress: 0 });
  });

  it("ranks best sellers and per-link metrics, keeping archived products visible", async () => {
    const result = await service().getForOwner(ownerA, "30d");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.bestSellers).toEqual([
      { titlePtBr: "Bolo", titleEn: "Cake", confirmedQuantity: 5, revenue: [{ currency: { code: "USD", label: "USD pair" }, amount: "5" }] },
      { titlePtBr: "Café", titleEn: "Coffee", confirmedQuantity: 3, revenue: [{ currency: { code: "BRL", label: "BRL via PIX" }, amount: "0.3" }] },
    ]);
    expect(result.view.paymentLinks.activeCount).toBe(1);
    expect(result.view.paymentLinks.metrics).toEqual([
      {
        identifier: "aaaaaaaaaaaaaaaaaaaaaaaa",
        descriptionPtBr: "Doação",
        descriptionEn: "Donation",
        attempts: 3,
        confirmedOrders: 2,
        confirmedVolume: [{ currency: { code: "BRL", label: "BRL via PIX" }, amount: "0.3" }],
      },
      {
        identifier: "bbbbbbbbbbbbbbbbbbbbbbbb",
        descriptionPtBr: null,
        descriptionEn: null,
        attempts: 1,
        confirmedOrders: 1,
        confirmedVolume: [{ currency: { code: "USD", label: "USD pair" }, amount: "5" }],
      },
    ]);
  });

  it("bounds and redacts the recent-activity feed with no internal identity in the DTO", async () => {
    const result = await service().getForOwner(ownerA, "today");
    if (result.kind !== "ready") throw new Error("expected ready");
    expect(result.view.period).toEqual({
      id: "today",
      from: new Date("2026-07-20T03:00:00.000Z"),
      to: new Date("2026-07-21T03:00:00.000Z"),
    });
    expect(result.view.recentActivity).toHaveLength(5);
    expect(result.view.recentActivity[0]).toMatchObject({ source: "LINK", amount: "50", state: "PENDING" });
    const serialized = JSON.stringify(result.view);
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(serialized).not.toContain("cccccccccccccccccccccccc");
  });
});
